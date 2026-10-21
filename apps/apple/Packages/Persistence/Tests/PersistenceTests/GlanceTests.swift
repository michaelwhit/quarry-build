import CoreModels
import Foundation
import Testing

@testable import Persistence

@MainActor
@Suite("At a glance")
struct GlanceTests {
    /// Goals handed out in these tests: one to the gen-ed teacher, one to the para only, and one
    /// to the gen-ed teacher that has already ended.
    struct Handout {
        var shared: UUID
        var paraOnly: UUID
        var ended: UUID
    }

    func makeStore() throws -> PrototypeStore {
        try makeStoreAndHandout().0
    }

    func makeStoreAndHandout() throws -> (PrototypeStore, Handout) {
        var dataset = try SyntheticDataset.load(
            from: Data(contentsOf: PrototypeStoreTests.fixtureURL))
        let genEd = try #require(dataset.staff.first { $0.role == .genEdTeacher })
        let para = try #require(dataset.staff.first { $0.role == .paraprofessional })
        let manager = try #require(dataset.staff.first { $0.role == .caseManager })
        // Goals of students on the gen-ed teacher's list, so each one could be shown.
        let mine = Set(
            dataset.caseloadAssignments.filter { $0.staffID == genEd.id }.map(\.studentID))
        let iepIDs = Set(dataset.ieps.filter { mine.contains($0.studentID) }.map(\.id))
        let goalIDs = dataset.goals.filter { iepIDs.contains($0.iepID) }.map(\.id)
        try #require(goalIDs.count >= 3)
        let handout = Handout(shared: goalIDs[0], paraOnly: goalIDs[1], ended: goalIDs[2])
        func delegation(_ goal: UUID, to staff: Staff, until: Date? = nil) -> GoalDelegation {
            GoalDelegation(
                id: UUID(), tenantID: dataset.tenant.id, goalID: goal, staffID: staff.id,
                grantedBy: manager.id, expiresAt: until)
        }
        dataset.goalDelegations = [
            delegation(handout.shared, to: genEd),
            delegation(handout.paraOnly, to: para),
            delegation(handout.ended, to: genEd, until: Date(timeIntervalSince1970: 1)),
        ]
        let today = LocalDate(year: 2026, month: 10, day: 17)!
        return (PrototypeStore(dataset: dataset, today: { today }), handout)
    }

    func signIn(_ store: PrototypeStore, as role: StaffRole) throws {
        store.signIn(as: try #require(store.dataset.staff.first { $0.role == role }))
    }

    @Test("only the gen-ed role opens My students")
    func roleFlag() {
        for role in StaffRole.allCases {
            #expect(RoleView(role: role).showsMyStudents == (role == .genEdTeacher))
        }
    }

    @Test("signed out lists nothing")
    func signedOut() throws {
        #expect(try makeStore().glanceStudents.isEmpty)
    }

    @Test("a gen-ed teacher sees the full name and whole text of the goals handed to them only")
    func genEd() throws {
        let (store, handout) = try makeStoreAndHandout()
        try signIn(store, as: .genEdTeacher)
        let shown = store.glanceStudents
        #expect(!shown.isEmpty)
        #expect(shown.map(\.id) == store.visibleStudents.map(\.id))
        let shownGoals = shown.flatMap(\.goals)
        let handed = try #require(store.dataset.goals.first { $0.id == handout.shared })
        for item in shown {
            let student = try #require(store.visibleStudents.first { $0.id == item.id })
            #expect(item.name == "\(student.firstName) \(student.lastName)")
        }
        #expect(shownGoals.map(\.id) == [handed.id])
        for goal in shownGoals {
            #expect(!goal.text.hasSuffix("..."))
            #expect(goal.text == handed.statement)
        }
    }

    @Test("a goal that was not handed to the person never appears, even on a student they can open")
    func undelegatedGoals() throws {
        let (store, handout) = try makeStoreAndHandout()
        try signIn(store, as: .genEdTeacher)
        let ids = Set(store.glanceStudents.flatMap(\.goals).map(\.id))
        #expect(!ids.contains(handout.paraOnly))
        #expect(!ids.contains(handout.ended))
        for student in store.visibleStudents {
            let allIDs = Set(store.goals(for: student).map(\.id))
            let shownIDs = Set((store.glanceStudent(id: student.id)?.goals ?? []).map(\.id))
            #expect(shownIDs.isSubset(of: allIDs))
            #expect(shownIDs.isSubset(of: store.delegatedGoalIDs))
        }
        // Nothing handed out at all means no goals, however many are on the IEP.
        let bare = try PrototypeStore(
            dataset: SyntheticDataset.load(from: Data(contentsOf: PrototypeStoreTests.fixtureURL)),
            today: { LocalDate(year: 2026, month: 10, day: 17)! })
        try signIn(bare, as: .genEdTeacher)
        #expect(bare.glanceStudents.flatMap(\.goals).isEmpty)
    }

    @Test("the case manager named on the page is the student's active caseload holder")
    func caseManager() throws {
        let store = try makeStore()
        try signIn(store, as: .genEdTeacher)
        for item in store.glanceStudents {
            let holder = store.dataset.caseloadAssignments.first {
                $0.studentID == item.id && $0.relationship == .caseload
            }
            #expect(item.caseManager == holder.map { store.staffName($0.staffID) })
        }
    }

    @Test("a student not on the person's list cannot be opened")
    func notShared() throws {
        let store = try makeStore()
        try signIn(store, as: .genEdTeacher)
        let mine = Set(store.glanceStudents.map(\.id))
        let other = try #require(store.allStudents.first { !mine.contains($0.id) })
        #expect(store.glanceStudent(id: other.id) == nil)
        store.signOut()
        let first = try #require(mine.first)
        #expect(store.glanceStudent(id: first) == nil)
    }

    @Test("the measured line names the way data is collected and the target")
    func measuredLine() throws {
        let (store, _) = try makeStoreAndHandout()
        try signIn(store, as: .genEdTeacher)
        let lines = store.glanceStudents.flatMap(\.goals).compactMap(\.measuredLine)
        #expect(!lines.isEmpty)
        #expect(lines.allSatisfy { $0.hasPrefix("Measured by: ") || $0.hasPrefix("Target: ") })
    }
}
