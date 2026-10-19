import CoreModels
import Foundation
import Testing

@testable import Persistence

@MainActor
@Suite("PrototypeStore")
struct PrototypeStoreTests {
    static let fixtureURL: URL = {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<7 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("packages/synthetic-data/fixtures/demo-district.json")
    }()

    func makeStore(stateURL: URL? = nil) throws -> PrototypeStore {
        let dataset = try SyntheticDataset.load(from: Data(contentsOf: Self.fixtureURL))
        let today = LocalDate(year: 2026, month: 10, day: 17)!
        return PrototypeStore(dataset: dataset, stateURL: stateURL, today: { today })
    }

    func staff(_ store: PrototypeStore, _ role: StaffRole) throws -> Staff {
        try #require(store.dataset.staff.first { $0.role == role })
    }

    @Test("nobody sees students until they sign in")
    func signedOut() throws {
        let store = try makeStore()
        #expect(store.visibleStudents.isEmpty)
        #expect(!store.canRecordData)
    }

    @Test("the director sees the whole district, a case manager only their caseload")
    func scoping() throws {
        let store = try makeStore()
        store.signIn(as: try staff(store, .spedDirector))
        #expect(store.visibleStudents.count == store.dataset.students.count)

        let manager = try staff(store, .caseManager)
        store.signIn(as: manager)
        let visible = store.visibleStudents
        #expect(!visible.isEmpty)
        #expect(visible.count < store.dataset.students.count)
        let allowed = Set(
            store.dataset.caseloadAssignments.filter { $0.staffID == manager.id }.map(\.studentID))
        #expect(visible.allSatisfy { allowed.contains($0.id) })
    }

    @Test("IT admins see no student data")
    func itAdmin() throws {
        let store = try makeStore()
        store.signIn(
            as: Staff(
                id: UUIDv7.make(), tenantID: store.dataset.tenant.id, email: "it@bluestem.example",
                displayName: "IT Admin", role: .districtITAdmin))
        #expect(store.visibleStudents.isEmpty)
        #expect(!store.canRecordData)
    }

    @Test("records a valid data point and refuses an invalid one")
    func recording() throws {
        let store = try makeStore()
        store.signIn(as: try staff(store, .spedDirector))
        let goal = try #require(
            store.dataset.goals.first { goal in
                store.plan(for: goal)?.type == .trials
            })
        let before = store.dataPoints(for: goal).count
        let point = try store.record(goal: goal, correct: 7, total: 10)
        #expect(store.dataPoints(for: goal).count == before + 1)
        #expect(store.dataPoints(for: goal).last?.id == point.id)
        #expect(point.deviceID == store.deviceID)

        #expect(throws: PrototypeStore.StoreError.invalidDataPoint(.correctExceedsTotal)) {
            try store.record(goal: goal, correct: 11, total: 10)
        }
        #expect(store.dataPoints(for: goal).count == before + 1)
    }

    @Test("a session's points land once, even when delivered twice")
    func addPointsOnce() throws {
        let store = try makeStore()
        store.signIn(as: try staff(store, .spedDirector))
        let goal = try #require(store.dataset.goals.first { store.plan(for: $0)?.type == .frequency })
        let plan = try #require(store.plan(for: goal))
        let before = store.dataPoints(for: goal).count
        let point = DataPoint(
            tenantID: goal.tenantID, goalID: goal.id, planID: plan.id, observedAt: Date(),
            valueNum: 3, collectorID: try staff(store, .spedDirector).id, deviceID: store.deviceID)
        #expect(try store.addPoints([point]) == 1)
        #expect(try store.addPoints([point]) == 0)
        #expect(store.dataPoints(for: goal).count == before + 1)
    }

    @Test("a session with one bad point stores nothing")
    func addPointsAllOrNothing() throws {
        let store = try makeStore()
        let director = try staff(store, .spedDirector)
        store.signIn(as: director)
        let goal = try #require(store.dataset.goals.first { store.plan(for: $0)?.type == .frequency })
        let plan = try #require(store.plan(for: goal))
        let good = DataPoint(
            tenantID: goal.tenantID, goalID: goal.id, planID: plan.id, observedAt: Date(),
            valueNum: 2, collectorID: director.id, deviceID: store.deviceID)
        let bad = DataPoint(
            tenantID: goal.tenantID, goalID: goal.id, planID: plan.id, observedAt: Date(),
            valueNum: -1, collectorID: director.id, deviceID: store.deviceID)
        #expect(throws: PrototypeStore.StoreError.self) { try store.addPoints([good, bad]) }
        #expect(store.addedPoints.isEmpty)
    }

    @Test("points for a student outside the signed-in person's scope are refused")
    func addPointsScope() throws {
        let store = try makeStore()
        let manager = try staff(store, .caseManager)
        store.signIn(as: manager)
        let visible = Set(store.visibleStudents.map(\.id))
        let goal = try #require(
            store.dataset.goals.first { goal in
                !(store.student(for: goal).map { visible.contains($0.id) } ?? true)
                    && store.plan(for: goal) != nil
            })
        let plan = try #require(store.plan(for: goal))
        let point = DataPoint(
            tenantID: goal.tenantID, goalID: goal.id, planID: plan.id, observedAt: Date(),
            valueNum: 1, collectorID: manager.id, deviceID: store.deviceID)
        #expect(throws: PrototypeStore.StoreError.notAllowed) { try store.addPoints([point]) }
    }

    @Test("a failed write rolls back and reports it, so the caller keeps its draft")
    func addPointsSaveFails() throws {
        let blocker = FileManager.default.temporaryDirectory
            .appendingPathComponent("blocker-\(UUID().uuidString)")
        try Data().write(to: blocker)
        defer { try? FileManager.default.removeItem(at: blocker) }
        let store = try makeStore(
            stateURL: blocker.appendingPathComponent("sub").appendingPathComponent("state.json"))
        let director = try staff(store, .spedDirector)
        store.signIn(as: director)
        let goal = try #require(store.dataset.goals.first { store.plan(for: $0)?.type == .frequency })
        let plan = try #require(store.plan(for: goal))
        let point = DataPoint(
            tenantID: goal.tenantID, goalID: goal.id, planID: plan.id, observedAt: Date(),
            valueNum: 2, collectorID: director.id, deviceID: store.deviceID)
        #expect(throws: PrototypeStore.StoreError.saveFailed) { try store.addPoints([point]) }
        #expect(store.addedPoints.isEmpty)
    }

    @Test("a point must be recorded by the signed-in person")
    func addPointsCollector() throws {
        let store = try makeStore()
        store.signIn(as: try staff(store, .spedDirector))
        let other = try #require(store.dataset.staff.first { $0.role != .spedDirector })
        let goal = try #require(store.dataset.goals.first { store.plan(for: $0)?.type == .frequency })
        let plan = try #require(store.plan(for: goal))
        let point = DataPoint(
            tenantID: goal.tenantID, goalID: goal.id, planID: plan.id, observedAt: Date(),
            valueNum: 2, collectorID: other.id, deviceID: store.deviceID)
        #expect(throws: PrototypeStore.StoreError.notAllowed) { try store.addPoints([point]) }
    }

    @Test("refuses to record when signed out")
    func signedOutRecord() throws {
        let store = try makeStore()
        let goal = try #require(store.dataset.goals.first)
        #expect(throws: PrototypeStore.StoreError.notSignedIn) {
            try store.record(goal: goal, valueNum: 1)
        }
    }

    @Test("an approval records who approved and whether the teacher edited the AI draft")
    func approval() throws {
        let store = try makeStore()
        let manager = try staff(store, .caseManager)
        store.signIn(as: manager)
        let student = try #require(store.visibleStudents.first)
        let goal = try #require(store.goals(for: student).first)
        try store.approve(
            goal: goal, sufficient: true, comment: "Edited by teacher.",
            aiSuggestedSufficient: true, aiSuggestedComment: "Draft.", provider: "mock")
        let saved = try #require(store.approval(for: goal))
        #expect(saved.approvedBy == manager.id)
        #expect(saved.wasEdited)
        store.removeApproval(for: goal)
        #expect(store.approval(for: goal) == nil)
    }

    @Test("a paraprofessional cannot approve an AI draft")
    func paraNoAI() throws {
        let store = try makeStore()
        store.signIn(as: try staff(store, .paraprofessional))
        let goal = try #require(store.dataset.goals.first)
        #expect(throws: PrototypeStore.StoreError.notAllowed) {
            try store.approve(
                goal: goal, sufficient: true, comment: "x", aiSuggestedSufficient: true,
                aiSuggestedComment: "x", provider: "mock")
        }
    }

    @Test("saved data comes back after a restart, and reset clears it")
    func persistence() throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("iep-proto-\(UUID().uuidString)/state.json")
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }

        let first = try makeStore(stateURL: url)
        first.signIn(as: try staff(first, .spedDirector))
        let goal = try #require(first.dataset.goals.first { first.plan(for: $0)?.type == .percentCorrect })
        let point = try first.record(goal: goal, valueNum: 61)

        let second = try makeStore(stateURL: url)
        #expect(second.deviceID == first.deviceID)
        #expect(second.addedPoints.map(\.id) == [point.id])

        second.resetLocalData()
        let third = try makeStore(stateURL: url)
        #expect(third.addedPoints.isEmpty)
    }
}
