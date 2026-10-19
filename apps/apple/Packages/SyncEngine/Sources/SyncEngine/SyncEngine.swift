import APIClient
import CoreModels
import Foundation
import Persistence

/// Where the engine is, for the sync indicator on screen.
public enum SyncStatus: Equatable, Sendable {
    /// Nothing in flight. `pending` counts entries still waiting to be sent.
    case idle(pending: Int, lastSync: Date?)
    case syncing
    /// The last attempt could not reach the server. Collection keeps working; entries queue.
    case offline(pending: Int)
}

/// A mutation the server refused. The reason is machine-readable and carries no student data.
public struct RejectedMutation: Equatable, Sendable {
    public var id: UUID
    public var reason: String
}

public struct SyncReport: Equatable, Sendable {
    /// Entries the server applied (including retries it had already applied).
    public var pushed = 0
    /// Entries whose id the server already holds for a different record.
    public var conflicts: [UUID] = []
    public var rejected: [RejectedMutation] = []
    /// Changes applied from the feed.
    public var pulled = 0

    public init() {}
}

public enum SyncError: Error, Equatable, Sendable {
    /// The server's answer did not match what was sent, or the feed stopped advancing.
    case malformedResponse
}

/// Outbox push, then change-feed pull (architecture section 6.3).
///
/// Safe to run any time and as often as you like: pushes are idempotent, pulls are upserts, and
/// the cursor moves only together with the rows it covers. A failure part-way leaves the outbox
/// and cursor consistent, and the next run carries on.
public actor SyncEngine {
    private let deviceID: UUID
    private let store: any SyncStore
    private let transport: any SyncTransport
    private let pushBatchSize: Int
    private let pullPageSize: Int
    private let now: @Sendable () -> Date
    private var running = false
    private var lastSync: Date?
    private let continuation: AsyncStream<SyncStatus>.Continuation

    /// The latest status, for a SwiftUI indicator. Delivers the newest value to each reader.
    public nonisolated let statuses: AsyncStream<SyncStatus>
    public private(set) var status: SyncStatus = .idle(pending: 0, lastSync: nil)

    public init(
        deviceID: UUID, store: any SyncStore, transport: any SyncTransport,
        pushBatchSize: Int = 500, pullPageSize: Int = 500,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.deviceID = deviceID
        self.store = store
        self.transport = transport
        self.pushBatchSize = pushBatchSize
        self.pullPageSize = pullPageSize
        self.now = now
        let (stream, continuation) = AsyncStream.makeStream(
            of: SyncStatus.self, bufferingPolicy: .bufferingNewest(1))
        self.statuses = stream
        self.continuation = continuation
    }

    /// Runs one push-then-pull round. A second call while one is running returns an empty
    /// report instead of overlapping with it.
    @discardableResult
    public func sync() async throws -> SyncReport {
        guard !running else { return SyncReport() }
        running = true
        defer { running = false }
        publish(.syncing)
        var report = SyncReport()
        do {
            try await push(into: &report)
            try await pull(into: &report)
        } catch {
            publish(.offline(pending: (try? await store.pendingOutboxCount()) ?? 0))
            throw error
        }
        lastSync = now()
        publish(.idle(pending: (try? await store.pendingOutboxCount()) ?? 0, lastSync: lastSync))
        return report
    }

    private func publish(_ new: SyncStatus) {
        status = new
        continuation.yield(new)
    }

    /// Reasons that can clear on their own: the goal, plan or point the entry refers to may not
    /// have reached the server (or this device's view of it) yet. Anything else needs a person.
    static let retryableReasons: Set<String> = [
        "unknown_goal", "unknown_plan", "unknown_objective", "unknown_corrected_point",
    ]
    static let maxAttempts = 3

    private func requeueRetryable() async throws {
        let retry = try await store.quarantined().filter {
            $0.status == .rejected && Self.retryableReasons.contains($0.reason)
                && $0.entry.attempts < Self.maxAttempts
        }
        if !retry.isEmpty { try await store.requeue(ids: retry.map(\.id)) }
    }

    private func push(into report: inout SyncReport) async throws {
        try await requeueRetryable()
        while true {
            let batch = try await store.pendingOutbox(limit: pushBatchSize)
            if batch.isEmpty { return }
            let results = try await transport.push(deviceID: deviceID, entries: batch)
            // One result per entry. Anything else means we cannot tell what was applied, so keep
            // the batch and retry (the server dedupes by id).
            guard Set(results.map(\.idempotencyKey)) == Set(batch.map(\.id)),
                results.count == batch.count
            else { throw SyncError.malformedResponse }

            let byID = Dictionary(uniqueKeysWithValues: batch.map { ($0.id, $0) })
            var applied: [UUID] = []
            var quarantine: [QuarantinedEntry] = []
            for result in results {
                switch result.status {
                case .applied:
                    report.pushed += 1
                    applied.append(result.idempotencyKey)
                case .conflict, .rejected:
                    let reason = result.reason ?? (result.status == .conflict ? "id_conflict" : "unknown")
                    if result.status == .conflict {
                        report.conflicts.append(result.idempotencyKey)
                    } else {
                        report.rejected.append(
                            RejectedMutation(id: result.idempotencyKey, reason: reason))
                    }
                    if let entry = byID[result.idempotencyKey] {
                        quarantine.append(
                            QuarantinedEntry(
                                entry: entry, status: result.status, reason: reason, quarantinedAt: now()))
                    }
                }
            }
            // Applied entries are done. Refused ones leave the outbox so they do not block the
            // queue, but stay on the device in quarantine until a person deals with them.
            try await store.settle(applied: applied, quarantine: quarantine)
        }
    }

    private func pull(into report: inout SyncReport) async throws {
        var cursor = try await store.cursor()
        while true {
            let page = try await transport.changes(since: cursor, limit: pullPageSize)
            guard page.cursor >= cursor else { throw SyncError.malformedResponse }
            // A page that claims more but did not move the cursor would loop forever. An empty
            // page whose cursor did move is fine: the server skipped rows this caller may not see.
            if page.hasMore && page.cursor == cursor { throw SyncError.malformedResponse }
            try await store.apply(changes: page.changes, cursor: page.cursor)
            report.pulled += page.changes.count
            cursor = page.cursor
            if !page.hasMore { return }
        }
    }
}
