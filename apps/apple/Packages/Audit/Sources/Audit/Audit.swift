import Foundation

/// One audit event recorded on the device. The server decides authorization and writes the
/// authoritative decision events; these are the client-side facts the server cannot see, such as
/// "a record was opened on screen" or "data was copied for SRS". The id is the idempotency key.
public struct ClientAuditEvent: Codable, Sendable, Equatable, Identifiable {
    public let id: UUID
    public let occurredAt: Date
    public let action: String
    public let entityType: String
    public let entityId: UUID?
    public let studentId: UUID?

    public init(
        id: UUID = UUID(),
        occurredAt: Date = Date(),
        action: String,
        entityType: String,
        entityId: UUID? = nil,
        studentId: UUID? = nil
    ) {
        self.id = id
        self.occurredAt = occurredAt
        self.action = action
        self.entityType = entityType
        self.entityId = entityId
        self.studentId = studentId
    }
}

/// Durable storage for events not yet uploaded. Production uses an encrypted file or database
/// table (Persistence); tests use `InMemoryAuditStore`.
public protocol AuditStore: Sendable {
    func load() async throws -> [ClientAuditEvent]
    func save(_ events: [ClientAuditEvent]) async throws
}

/// Sends events to the server. Must be idempotent per event id.
public protocol AuditUploader: Sendable {
    func upload(_ events: [ClientAuditEvent]) async throws
}

public enum AuditQueueError: Error, Equatable {
    /// The queue is full. Callers must refuse the audited action (fail closed): a read that
    /// cannot be recorded does not happen.
    case full
}

/// Persists events before `record` returns, so a crash cannot lose them, and uploads them in
/// order in batches. An event leaves the queue only after the server accepted its batch.
public actor AuditQueue {
    private let store: any AuditStore
    private let uploader: any AuditUploader
    private let maxBatch: Int
    private let maxQueued: Int
    private var events: [ClientAuditEvent] = []
    private var loaded = false
    private var loadTask: Task<[ClientAuditEvent], Error>?
    private var saveTail: Task<Void, Error>?
    private var flushing = false

    public init(
        store: any AuditStore,
        uploader: any AuditUploader,
        maxBatch: Int = 50,
        maxQueued: Int = 5_000
    ) {
        self.store = store
        self.uploader = uploader
        self.maxBatch = max(1, maxBatch)
        self.maxQueued = max(1, maxQueued)
    }

    public var pendingCount: Int {
        get async throws {
            try await loadIfNeeded()
            return events.count
        }
    }

    /// Adds an event and saves it to the store. Throws if it could not be saved or the queue is full.
    public func record(_ event: ClientAuditEvent) async throws {
        try await loadIfNeeded()
        if events.contains(where: { $0.id == event.id }) { return }
        guard events.count < maxQueued else { throw AuditQueueError.full }
        events.append(event)
        do {
            try await persist()
        } catch {
            events.removeAll { $0.id == event.id }
            throw error
        }
    }

    /// Uploads everything queued, oldest first, one batch at a time. Returns how many events the
    /// server accepted. Stops at the first failed batch and keeps it queued for the next attempt.
    @discardableResult
    public func flush() async throws -> Int {
        try await loadIfNeeded()
        guard !flushing else { return 0 }
        flushing = true
        defer { flushing = false }
        var sent = 0
        while !events.isEmpty {
            let batch = Array(events.prefix(maxBatch))
            try await uploader.upload(batch)
            let accepted = Set(batch.map(\.id))
            events.removeAll { accepted.contains($0.id) }
            try await persist()
            sent += batch.count
        }
        return sent
    }

    /// Actors are reentrant: while one caller waits on the store, another can run. All callers share
    /// one load, and only the first to resume installs it, so a later caller can never replace the
    /// in-memory events with an older snapshot.
    private func loadIfNeeded() async throws {
        guard !loaded else { return }
        let task: Task<[ClientAuditEvent], Error>
        if let existing = loadTask {
            task = existing
        } else {
            let store = self.store
            task = Task { try await store.load() }
            loadTask = task
        }
        do {
            let loadedEvents = try await task.value
            if !loaded {
                events = loadedEvents
                loaded = true
            }
        } catch {
            loadTask = nil  // let the next call try again
            throw error
        }
    }

    /// Saves the current events. Writes are chained so they reach the store in call order and the
    /// last write is always the newest snapshot, even when the store finishes saves out of order.
    private func persist() async throws {
        let snapshot = events
        let previous = saveTail
        let store = self.store
        let task = Task {
            _ = await previous?.result
            try await store.save(snapshot)
        }
        saveTail = task
        try await task.value
    }
}

/// Keeps events in memory only. For tests and previews.
public actor InMemoryAuditStore: AuditStore {
    private var saved: [ClientAuditEvent]

    public init(_ initial: [ClientAuditEvent] = []) {
        saved = initial
    }

    public func load() async throws -> [ClientAuditEvent] { saved }
    public func save(_ events: [ClientAuditEvent]) async throws { saved = events }
}
