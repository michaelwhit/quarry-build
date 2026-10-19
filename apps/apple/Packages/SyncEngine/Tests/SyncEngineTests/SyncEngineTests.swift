import APIClient
import CoreModels
import Foundation
import Persistence
import Testing

@testable import SyncEngine

struct Offline: Error {}

/// A stand-in for the api with the same rules: data points are idempotent by id, every change
/// gets the next position, and the feed returns positions after the cursor.
actor FakeServer: SyncTransport {
    private var seq: Int64 = 0
    private var feed: [SyncChange] = []
    private var pointIDs: Set<UUID> = []
    private(set) var applyCount = 0
    var failNextPush = false
    var dropNextPushResponse = false
    var failNextPull = false

    func setFailNextPush(_ value: Bool) { failNextPush = value }
    func setDropNextPushResponse(_ value: Bool) { dropNextPushResponse = value }
    func setFailNextPull(_ value: Bool) { failNextPull = value }

    func publish(entity: String, id: UUID, row: [String: JSONValue]) {
        seq += 1
        feed.append(SyncChange(entity: entity, id: id, serverSeq: seq, row: row))
    }

    func tombstone(entity: String, id: UUID) {
        seq += 1
        feed.append(SyncChange(entity: entity, id: id, serverSeq: seq, deleted: true))
    }

    func push(deviceID: UUID, entries: [OutboxEntry]) async throws -> [MutationResult] {
        if failNextPush {
            failNextPush = false
            throw Offline()
        }
        var results: [MutationResult] = []
        for entry in entries {
            guard let id = entry.payload["id"]?.stringValue.flatMap({ UUID(uuidString: $0) }) else {
                results.append(
                    MutationResult(
                        idempotencyKey: entry.id, status: .rejected, reason: "invalid_id"))
                continue
            }
            if !pointIDs.contains(id), case .object(let fields) = entry.payload {
                pointIDs.insert(id)
                applyCount += 1
                seq += 1
                feed.append(SyncChange(entity: "data_point", id: id, serverSeq: seq, row: fields))
            }
            results.append(MutationResult(idempotencyKey: entry.id, status: .applied))
        }
        if dropNextPushResponse {
            dropNextPushResponse = false
            throw Offline()
        }
        return results
    }

    func changes(since: Int64, limit: Int) async throws -> SyncPage {
        if failNextPull {
            failNextPull = false
            throw Offline()
        }
        let after = feed.filter { $0.serverSeq > since }
        let page = Array(after.prefix(limit))
        return SyncPage(
            changes: page, cursor: page.last?.serverSeq ?? since, hasMore: after.count > limit)
    }
}

/// A transport that answers every push with a canned result.
struct CannedTransport: SyncTransport {
    var status: MutationResult.Status
    var reason: String?
    func push(deviceID: UUID, entries: [OutboxEntry]) async throws -> [MutationResult] {
        entries.map { MutationResult(idempotencyKey: $0.id, status: status, reason: reason) }
    }
    func changes(since: Int64, limit: Int) async throws -> SyncPage {
        SyncPage(changes: [], cursor: since, hasMore: false)
    }
}

let tenant = UUID()
let staff = UUID()

func point(device: UUID, goal: UUID = UUID(), plan: UUID = UUID()) -> DataPoint {
    DataPoint(
        tenantID: tenant, goalID: goal, planID: plan, observedAt: Date(), correct: 7, total: 10,
        collectorID: staff, deviceID: device)
}

func queued(_ store: InMemorySyncStore, _ points: [DataPoint]) async throws {
    for p in points { await store.enqueue(try OutboxEntry(dataPoint: p)) }
}

@Suite("SyncEngine")
struct SyncEngineTests {
    @Test("pushes the outbox, empties it, and pulls what it sent back as rows")
    func pushAndPull() async throws {
        let server = FakeServer()
        let store = InMemorySyncStore()
        let device = UUID()
        let points = (0..<3).map { _ in point(device: device) }
        try await queued(store, points)

        let engine = SyncEngine(deviceID: device, store: store, transport: server)
        let report = try await engine.sync()

        #expect(report.pushed == 3)
        #expect(report.pulled == 3)
        #expect(try await store.pendingOutboxCount() == 0)
        #expect(await store.ids(of: "data_point") == Set(points.map(\.id)))
        if case .idle(let pending, let last) = await engine.status {
            #expect(pending == 0)
            #expect(last != nil)
        } else {
            Issue.record("expected idle")
        }
    }

    @Test("a lost response is retried without duplicating anything")
    func lostResponse() async throws {
        let server = FakeServer()
        let store = InMemorySyncStore()
        let device = UUID()
        try await queued(store, [point(device: device), point(device: device)])
        let engine = SyncEngine(deviceID: device, store: store, transport: server)

        await server.setDropNextPushResponse(true)
        await #expect(throws: Offline.self) { try await engine.sync() }
        // The server applied both, but the device never heard. The outbox still holds them.
        #expect(try await store.pendingOutboxCount() == 2)
        if case .offline(let pending) = await engine.status { #expect(pending == 2) }

        let report = try await engine.sync()
        #expect(report.pushed == 2)
        #expect(try await store.pendingOutboxCount() == 0)
        #expect(await server.applyCount == 2)
        #expect(await store.ids(of: "data_point").count == 2)
    }

    @Test("an unreachable server leaves the outbox and cursor alone")
    func offline() async throws {
        let server = FakeServer()
        let store = InMemorySyncStore()
        let device = UUID()
        try await queued(store, [point(device: device)])
        let engine = SyncEngine(deviceID: device, store: store, transport: server)

        await server.setFailNextPush(true)
        await #expect(throws: Offline.self) { try await engine.sync() }
        #expect(try await store.pendingOutboxCount() == 1)
        #expect(try await store.cursor() == 0)

        await server.setFailNextPull(true)
        await #expect(throws: Offline.self) { try await engine.sync() }
        #expect(try await store.pendingOutboxCount() == 0)  // the push got through
        #expect(try await store.cursor() == 0)

        try await engine.sync()
        #expect(try await store.cursor() == 1)
    }

    @Test("two devices that record offline converge with no lost or duplicated points")
    func twoDevicesConverge() async throws {
        let server = FakeServer()
        let phone = UUID()
        let mac = UUID()
        let phoneStore = InMemorySyncStore()
        let macStore = InMemorySyncStore()
        let goal = UUID()
        let plan = UUID()
        let fromPhone = (0..<5).map { _ in point(device: phone, goal: goal, plan: plan) }
        let fromMac = (0..<4).map { _ in point(device: mac, goal: goal, plan: plan) }
        try await queued(phoneStore, fromPhone)
        try await queued(macStore, fromMac)
        let phoneEngine = SyncEngine(
            deviceID: phone, store: phoneStore, transport: server, pullPageSize: 2)
        let macEngine = SyncEngine(
            deviceID: mac, store: macStore, transport: server, pullPageSize: 3)

        // Both reconnect; the phone's first response is dropped and retried.
        await server.setDropNextPushResponse(true)
        _ = try? await phoneEngine.sync()
        try await macEngine.sync()
        try await phoneEngine.sync()
        try await macEngine.sync()
        try await phoneEngine.sync()

        let everything = Set((fromPhone + fromMac).map(\.id))
        #expect(await phoneStore.ids(of: "data_point") == everything)
        #expect(await macStore.ids(of: "data_point") == everything)
        #expect(await server.applyCount == 9)
        #expect(try await phoneStore.cursor() == macStore.cursor())
    }

    @Test("tombstones remove rows, and losing the last assignment purges the student")
    func purge() async throws {
        let server = FakeServer()
        let store = InMemorySyncStore(ownStaffId: staff)
        let device = UUID()
        let student = UUID()
        let otherStudent = UUID()
        let goal = UUID()
        let otherGoal = UUID()
        let assignment = UUID()
        let secondAssignment = UUID()
        let pointID = UUID()
        func s(_ id: UUID) -> JSONValue { .string(id.uuidString.lowercased()) }

        await server.publish(entity: "student", id: student, row: ["display_name": .string("Fake S.")])
        await server.publish(entity: "student", id: otherStudent, row: ["display_name": .string("Other O.")])
        await server.publish(entity: "iep", id: UUID(), row: ["student_id": s(student)])
        await server.publish(entity: "goal", id: goal, row: ["student_id": s(student)])
        await server.publish(entity: "goal", id: otherGoal, row: ["student_id": s(otherStudent)])
        await server.publish(entity: "data_point", id: pointID, row: ["goal_id": s(goal)])
        await server.publish(entity: "data_point", id: UUID(), row: ["goal_id": s(otherGoal)])
        await server.publish(entity: "caseload_assignment", id: assignment, row: ["student_id": s(student), "staff_id": s(staff)])
        await server.publish(entity: "caseload_assignment", id: secondAssignment, row: ["student_id": s(student), "staff_id": s(staff)])
        let engine = SyncEngine(deviceID: device, store: store, transport: server)
        try await engine.sync()
        #expect(await store.ids(of: "student").count == 2)

        // One of two assignments ends: the student stays.
        await server.tombstone(entity: "caseload_assignment", id: assignment)
        try await engine.sync()
        #expect(await store.ids(of: "student").contains(student))

        // The last one ends: the student and everything under them go; other students stay.
        await server.tombstone(entity: "caseload_assignment", id: secondAssignment)
        try await engine.sync()
        #expect(await store.ids(of: "student") == [otherStudent])
        #expect(await store.ids(of: "goal") == [otherGoal])
        #expect(await store.ids(of: "iep").isEmpty)
        #expect(await store.ids(of: "data_point").count == 1)

        // A plain tombstone removes just that row.
        await server.tombstone(entity: "goal", id: otherGoal)
        try await engine.sync()
        #expect(await store.ids(of: "goal").isEmpty)
    }

    @Test("another staff member's assignment ending never purges a tenant-wide reader's student")
    func othersAssignmentsDoNotPurge() async throws {
        let server = FakeServer()
        let director = UUID()
        let store = InMemorySyncStore(ownStaffId: director)
        let student = UUID()
        let theirs = UUID()
        func s(_ id: UUID) -> JSONValue { .string(id.uuidString.lowercased()) }
        await server.publish(entity: "student", id: student, row: ["display_name": .string("Fake S.")])
        await server.publish(
            entity: "caseload_assignment", id: theirs,
            row: ["student_id": s(student), "staff_id": s(UUID())])
        let engine = SyncEngine(deviceID: UUID(), store: store, transport: server)
        try await engine.sync()
        await server.tombstone(entity: "caseload_assignment", id: theirs)
        try await engine.sync()
        #expect(await store.ids(of: "student") == [student])
    }

    @Test("an assignment past its end date, and a store without an owner, behave as documented")
    func endDatesAndNoOwner() async throws {
        let server = FakeServer()
        let student = UUID()
        let assignment = UUID()
        func s(_ id: UUID) -> JSONValue { .string(id.uuidString.lowercased()) }
        await server.publish(entity: "student", id: student, row: ["display_name": .string("Fake S.")])
        await server.publish(
            entity: "caseload_assignment", id: assignment,
            row: [
                "student_id": s(student), "staff_id": s(staff),
                "end_date": .string("2026-10-01"),
            ])
        // Evening of Oct 2, Central time: the assignment ended on Oct 1.
        let after = Date(timeIntervalSince1970: 1_791_000_000)
        let owned = InMemorySyncStore(ownStaffId: staff, now: { after })
        try await SyncEngine(deviceID: UUID(), store: owned, transport: server).sync()
        #expect(await owned.ids(of: "student").isEmpty)
        let before = Date(timeIntervalSince1970: 1_790_000_000)
        let early = InMemorySyncStore(ownStaffId: staff, now: { before })
        try await SyncEngine(deviceID: UUID(), store: early, transport: server).sync()
        #expect(await early.ids(of: "student") == [student])
        let anonymous = InMemorySyncStore(now: { after })
        try await SyncEngine(deviceID: UUID(), store: anonymous, transport: server).sync()
        #expect(await anonymous.ids(of: "student") == [student])
    }

    @Test("a deleted or expired delegation removes the goal for a delegated-only role")
    func delegationEnds() async throws {
        let server = FakeServer()
        let student = UUID()
        let goal = UUID()
        let delegation = UUID()
        let point = UUID()
        func s(_ id: UUID) -> JSONValue { .string(id.uuidString.lowercased()) }
        await server.publish(entity: "student", id: student, row: ["display_name": .string("Fake S.")])
        await server.publish(entity: "goal", id: goal, row: ["student_id": s(student)])
        await server.publish(entity: "data_point", id: point, row: ["goal_id": s(goal)])
        await server.publish(
            entity: "goal_delegation", id: delegation,
            row: ["goal_id": s(goal), "staff_id": s(staff)])
        let store = InMemorySyncStore(ownStaffId: staff, delegatedGoalsOnly: true)
        let engine = SyncEngine(deviceID: UUID(), store: store, transport: server)
        try await engine.sync()
        #expect(await store.ids(of: "goal") == [goal])
        await server.tombstone(entity: "goal_delegation", id: delegation)
        try await engine.sync()
        #expect(await store.ids(of: "goal").isEmpty)
        #expect(await store.ids(of: "data_point").isEmpty)
        #expect(await store.ids(of: "student") == [student])

        // A case manager's store keeps goals when a delegation row goes away.
        let cm = InMemorySyncStore(ownStaffId: staff)
        try await SyncEngine(deviceID: UUID(), store: cm, transport: server).sync()
        #expect(await cm.ids(of: "student") == [student])
    }

    @Test("an empty page that moves the cursor is fine, one that claims more and stands still is not")
    func emptyPages() async throws {
        struct Skipping: SyncTransport {
            func push(deviceID: UUID, entries: [OutboxEntry]) async throws -> [MutationResult] { [] }
            func changes(since: Int64, limit: Int) async throws -> SyncPage {
                since == 0
                    ? SyncPage(changes: [], cursor: 5, hasMore: true)
                    : SyncPage(changes: [], cursor: since, hasMore: false)
            }
        }
        struct Stuck: SyncTransport {
            func push(deviceID: UUID, entries: [OutboxEntry]) async throws -> [MutationResult] { [] }
            func changes(since: Int64, limit: Int) async throws -> SyncPage {
                SyncPage(changes: [], cursor: since, hasMore: true)
            }
        }
        let store = InMemorySyncStore()
        try await SyncEngine(deviceID: UUID(), store: store, transport: Skipping()).sync()
        #expect(try await store.cursor() == 5)
        await #expect(throws: SyncError.malformedResponse) {
            try await SyncEngine(deviceID: UUID(), store: InMemorySyncStore(), transport: Stuck())
                .sync()
        }
    }


    @Test("refused entries leave the outbox but are kept for review, never deleted")
    func quarantine() async throws {
        let device = UUID()
        let cases: [(MutationResult.Status, String?)] = [
            (.rejected, "goal_not_delegated"), (.conflict, nil),
        ]
        for (status, reason) in cases {
            let store = InMemorySyncStore()
            let p = point(device: device)
            try await queued(store, [p])
            let engine = SyncEngine(
                deviceID: device, store: store,
                transport: CannedTransport(status: status, reason: reason))
            let report = try await engine.sync()
            #expect(try await store.pendingOutboxCount() == 0)
            let kept = try await store.quarantined()
            #expect(kept.count == 1)
            #expect(kept.first?.status == status)
            #expect(kept.first?.entry.payload["id"]?.stringValue?.lowercased() == p.id.uuidString.lowercased())
            if status == .rejected {
                #expect(report.rejected.map(\.reason) == ["goal_not_delegated"])
            } else {
                #expect(report.conflicts.count == 1)
            }
            // A reason that needs a person is never retried by the engine.
            _ = try await engine.sync()
            #expect(try await store.quarantined().count == 1)
            #expect(try await store.pendingOutboxCount() == 0)
        }
    }

    @Test("an entry refused for a missing goal is retried a few times, then waits for a person")
    func retryable() async throws {
        let device = UUID()
        let store = InMemorySyncStore()
        try await queued(store, [point(device: device)])
        let engine = SyncEngine(
            deviceID: device, store: store,
            transport: CannedTransport(status: .rejected, reason: "unknown_goal"))
        for _ in 0..<6 { _ = try await engine.sync() }
        let kept = try await store.quarantined()
        #expect(kept.count == 1)
        #expect(kept.first?.entry.attempts == 3)
        #expect(try await store.pendingOutboxCount() == 0)

        // The teacher can re-queue or discard it from the "needs attention" list.
        try await store.requeue(ids: kept.map(\.id))
        #expect(try await store.pendingOutboxCount() == 1)
        _ = try await engine.sync()
        try await store.discardQuarantined(ids: try await store.quarantined().map(\.id))
        #expect(try await store.quarantined().isEmpty)
    }

    @Test("a server that answers for the wrong entries is not trusted")
    func malformed() async throws {
        struct Wrong: SyncTransport {
            func push(deviceID: UUID, entries: [OutboxEntry]) async throws -> [MutationResult] {
                [MutationResult(idempotencyKey: UUID(), status: .applied)]
            }
            func changes(since: Int64, limit: Int) async throws -> SyncPage {
                SyncPage(changes: [], cursor: since, hasMore: false)
            }
        }
        let store = InMemorySyncStore()
        let device = UUID()
        try await queued(store, [point(device: device)])
        let engine = SyncEngine(deviceID: device, store: store, transport: Wrong())
        await #expect(throws: SyncError.malformedResponse) { try await engine.sync() }
        #expect(try await store.pendingOutboxCount() == 1)
    }

    @Test("sync models round-trip the wire format")
    func wireFormat() throws {
        let json = """
            {"changes":[{"entity":"goal","id":"01900000-0000-7000-8000-000000000001","server_seq":12,
              "deleted":false,"row":{"sequence":0,"statement":"Fake goal","standard_refs":["RL.2.1"],"x":null}},
             {"entity":"goal","id":"01900000-0000-7000-8000-000000000002","server_seq":13,"deleted":true}],
             "cursor":13,"has_more":true}
            """
        let page = try JSONDecoder().decode(SyncPage.self, from: Data(json.utf8))
        #expect(page.cursor == 13 && page.hasMore)
        #expect(page.changes[0].row?["statement"] == .string("Fake goal"))
        #expect(page.changes[0].row?["standard_refs"] == .array([.string("RL.2.1")]))
        #expect(page.changes[0].row?["x"] == .null)
        #expect(page.changes[1].deleted && page.changes[1].row == nil)
        let echoed = try JSONDecoder().decode(SyncPage.self, from: JSONEncoder().encode(page))
        #expect(echoed == page)
    }
}
