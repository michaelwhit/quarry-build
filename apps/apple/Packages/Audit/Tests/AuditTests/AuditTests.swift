import Foundation
import Testing

@testable import Audit

private struct Boom: Error {}

private actor RecordingUploader: AuditUploader {
    private(set) var batches: [[ClientAuditEvent]] = []
    private var failuresLeft: Int

    init(failFirst: Int = 0) { failuresLeft = failFirst }

    func upload(_ events: [ClientAuditEvent]) async throws {
        if failuresLeft > 0 {
            failuresLeft -= 1
            throw Boom()
        }
        batches.append(events)
    }
}

private actor FailingStore: AuditStore {
    func load() async throws -> [ClientAuditEvent] { [] }
    func save(_ events: [ClientAuditEvent]) async throws { throw Boom() }
}

/// A store with real latency: the first load is slow, and the first save is slower than the rest.
private actor SlowStore: AuditStore {
    private var saved: [ClientAuditEvent]
    private var saveCalls = 0
    private(set) var loadCalls = 0

    init(_ initial: [ClientAuditEvent] = []) { saved = initial }

    func load() async throws -> [ClientAuditEvent] {
        loadCalls += 1
        let snapshot = saved
        try await Task.sleep(for: .milliseconds(80))
        return snapshot
    }

    func save(_ events: [ClientAuditEvent]) async throws {
        saveCalls += 1
        let delay = saveCalls == 1 ? 80 : 5
        try await Task.sleep(for: .milliseconds(delay))
        saved = events
    }

    func current() -> [ClientAuditEvent] { saved }
}

private func event(_ action: String) -> ClientAuditEvent {
    ClientAuditEvent(action: action, entityType: "student", entityId: UUID(), studentId: UUID())
}

@Suite("AuditQueue")
struct AuditTests {
    @Test("events are saved before record returns")
    func savedBeforeReturn() async throws {
        let store = InMemoryAuditStore()
        let queue = AuditQueue(store: store, uploader: RecordingUploader())
        let e = event("open_student")
        try await queue.record(e)
        #expect(try await store.load() == [e])
        #expect(try await queue.pendingCount == 1)
    }

    @Test("a restart picks up events left in the store")
    func survivesRestart() async throws {
        let e = event("copy_for_srs")
        let queue = AuditQueue(store: InMemoryAuditStore([e]), uploader: RecordingUploader())
        #expect(try await queue.pendingCount == 1)
    }

    @Test("flush uploads oldest first in batches and empties the queue")
    func flushInBatches() async throws {
        let uploader = RecordingUploader()
        let store = InMemoryAuditStore()
        let queue = AuditQueue(store: store, uploader: uploader, maxBatch: 2)
        let all = (1...5).map { event("e\($0)") }
        for e in all { try await queue.record(e) }
        let sent = try await queue.flush()
        #expect(sent == 5)
        #expect(await uploader.batches.map(\.count) == [2, 2, 1])
        #expect(await uploader.batches.flatMap { $0 } == all)
        #expect(try await queue.pendingCount == 0)
        #expect(try await store.load().isEmpty)
    }

    @Test("a failed upload keeps the events for the next attempt")
    func failedUploadKeepsEvents() async throws {
        let uploader = RecordingUploader(failFirst: 1)
        let queue = AuditQueue(store: InMemoryAuditStore(), uploader: uploader)
        try await queue.record(event("a"))
        try await queue.record(event("b"))
        await #expect(throws: Boom.self) { try await queue.flush() }
        #expect(try await queue.pendingCount == 2)
        #expect(try await queue.flush() == 2)
        #expect(try await queue.pendingCount == 0)
    }

    @Test("recording the same event id twice queues it once")
    func dedupes() async throws {
        let queue = AuditQueue(store: InMemoryAuditStore(), uploader: RecordingUploader())
        let e = event("a")
        try await queue.record(e)
        try await queue.record(e)
        #expect(try await queue.pendingCount == 1)
    }

    @Test("a full queue refuses new events so the audited action can be refused")
    func failsClosedWhenFull() async throws {
        let queue = AuditQueue(store: InMemoryAuditStore(), uploader: RecordingUploader(), maxQueued: 2)
        try await queue.record(event("a"))
        try await queue.record(event("b"))
        await #expect(throws: AuditQueueError.full) { try await queue.record(event("c")) }
        #expect(try await queue.pendingCount == 2)
    }

    @Test("an event that could not be saved is not left in the queue")
    func saveFailureRollsBack() async throws {
        let queue = AuditQueue(store: FailingStore(), uploader: RecordingUploader())
        await #expect(throws: Boom.self) { try await queue.record(event("a")) }
        #expect(try await queue.pendingCount == 0)
    }

    @Test("concurrent first calls share one load and lose no event")
    func concurrentFirstCalls() async throws {
        let store = SlowStore()
        let queue = AuditQueue(store: store, uploader: RecordingUploader())
        let a = event("a")
        let b = event("b")
        async let first: Void = queue.record(a)
        async let second: Void = queue.record(b)
        _ = try await (first, second)
        #expect(await store.loadCalls == 1)
        #expect(try await queue.pendingCount == 2)
        let stored = await store.current()
        #expect(Set(stored.map(\.id)) == Set([a.id, b.id]))
    }

    @Test("overlapping saves cannot leave an older snapshot as the last write")
    func savesApplyInOrder() async throws {
        let store = SlowStore()
        let queue = AuditQueue(store: store, uploader: RecordingUploader())
        _ = try await queue.pendingCount  // load first so both records go straight to saving
        let a = event("a")
        let b = event("b")
        async let first: Void = queue.record(a)
        async let second: Void = queue.record(b)
        _ = try await (first, second)
        let stored = await store.current()
        #expect(Set(stored.map(\.id)) == Set([a.id, b.id]))
    }
}
