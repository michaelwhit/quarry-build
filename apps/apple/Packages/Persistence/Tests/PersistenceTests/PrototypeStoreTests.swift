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

    @Test("a case manager adds a student who then appears only on their own list")
    func addingStudent() throws {
        let store = try makeStore()
        let manager = try staff(store, .caseManager)
        store.signIn(as: manager)
        let school = try #require(store.dataset.schools.first)
        let before = store.visibleStudents.count

        let student = try store.addStudent(
            firstName: "  Robin ", lastName: "Test", preferredName: "  ", grade: " 4 ",
            schoolID: school.id)
        #expect(student.firstName == "Robin")
        #expect(student.preferredName == nil)
        #expect(student.grade == "4")
        #expect(store.visibleStudents.count == before + 1)
        #expect(store.visibleStudents.contains { $0.id == student.id })

        let other = try #require(
            store.dataset.staff.first { $0.role == .caseManager && $0.id != manager.id })
        store.signIn(as: other)
        #expect(!store.visibleStudents.contains { $0.id == student.id })

        store.signIn(as: try staff(store, .spedDirector))
        #expect(store.visibleStudents.contains { $0.id == student.id })
    }

    @Test("adding a student needs a name, a grade and a real school, and the right role")
    func addingStudentRules() throws {
        let store = try makeStore()
        let school = try #require(store.dataset.schools.first)
        #expect(throws: PrototypeStore.StoreError.notSignedIn) {
            try store.addStudent(firstName: "A", lastName: "B", grade: "1", schoolID: school.id)
        }

        store.signIn(as: try staff(store, .paraprofessional))
        #expect(throws: PrototypeStore.StoreError.notAllowed) {
            try store.addStudent(firstName: "A", lastName: "B", grade: "1", schoolID: school.id)
        }

        store.signIn(as: try staff(store, .caseManager))
        #expect(throws: PrototypeStore.StoreError.invalidStudent(.firstNameMissing)) {
            try store.addStudent(firstName: " ", lastName: "B", grade: "1", schoolID: school.id)
        }
        #expect(throws: PrototypeStore.StoreError.invalidStudent(.lastNameMissing)) {
            try store.addStudent(firstName: "A", lastName: "", grade: "1", schoolID: school.id)
        }
        #expect(throws: PrototypeStore.StoreError.invalidStudent(.gradeMissing)) {
            try store.addStudent(firstName: "A", lastName: "B", grade: "  ", schoolID: school.id)
        }
        let tooLong = String(repeating: "x", count: PrototypeStore.maxNameLength + 1)
        #expect(throws: PrototypeStore.StoreError.invalidStudent(.nameTooLong)) {
            try store.addStudent(firstName: tooLong, lastName: "B", grade: "1", schoolID: school.id)
        }
        #expect(throws: PrototypeStore.StoreError.invalidStudent(.nameTooLong)) {
            try store.addStudent(
                firstName: "A", lastName: "B", preferredName: tooLong, grade: "1", schoolID: school.id)
        }
        #expect(throws: PrototypeStore.StoreError.unknownSchool) {
            try store.addStudent(firstName: "A", lastName: "B", grade: "1", schoolID: UUIDv7.make())
        }
        #expect(store.addedStudents.isEmpty)
    }

    @Test("editing changes a student on the list, and only one the person can see")
    func editingStudent() throws {
        let store = try makeStore()
        let manager = try staff(store, .caseManager)
        store.signIn(as: manager)
        let existing = try #require(store.visibleStudents.first)
        let school = try #require(store.dataset.schools.first)

        let changed = try store.updateStudent(
            id: existing.id, firstName: "Alex", lastName: existing.lastName,
            preferredName: "Lex", grade: "5", schoolID: school.id)
        #expect(changed.displayName == "Lex")
        let shown = try #require(store.visibleStudents.first { $0.id == existing.id })
        #expect(shown.firstName == "Alex")
        #expect(shown.grade == "5")

        let outside = try #require(
            store.dataset.students.first { student in
                !store.visibleStudents.contains { $0.id == student.id }
            })
        #expect(throws: PrototypeStore.StoreError.notAllowed) {
            try store.updateStudent(
                id: outside.id, firstName: "X", lastName: "Y", grade: "1", schoolID: school.id)
        }
    }

    @Test("added and edited students come back after a restart, and reset clears them")
    func studentPersistence() throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("iep-proto-\(UUID().uuidString)/state.json")
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }

        let first = try makeStore(stateURL: url)
        first.signIn(as: try staff(first, .spedDirector))
        let school = try #require(first.dataset.schools.first)
        let added = try first.addStudent(
            firstName: "Robin", lastName: "Test", grade: "2", schoolID: school.id)
        let existing = try #require(first.dataset.students.first)
        try first.updateStudent(
            id: existing.id, firstName: "Alex", lastName: existing.lastName, grade: "6",
            schoolID: existing.schoolID)

        let second = try makeStore(stateURL: url)
        second.signIn(as: try staff(second, .spedDirector))
        #expect(second.addedStudents.map(\.id) == [added.id])
        #expect(second.visibleStudents.contains { $0.id == added.id })
        #expect(second.visibleStudents.first { $0.id == existing.id }?.firstName == "Alex")

        second.resetLocalData()
        let third = try makeStore(stateURL: url)
        #expect(third.addedStudents.isEmpty)
        #expect(third.studentEdits.isEmpty)
    }

    // MARK: Goals

    func percentDraft(_ statement: String = "Given a grade-level passage, Robin reads it aloud.")
        -> GoalDraft
    {
        GoalDraft(
            area: .reading, statement: statement, baseline: "40% correct", target: "80% correct",
            type: .percentCorrect, unit: "percent", targetValue: 80, frequency: "2x weekly")
    }

    @Test("a goal written for a student added by hand gets a plan year and a data plan")
    func addingGoalToNewStudent() throws {
        let store = try makeStore()
        store.signIn(as: try staff(store, .caseManager))
        let school = try #require(store.dataset.schools.first)
        let student = try store.addStudent(
            firstName: "Robin", lastName: "Test", grade: "2", schoolID: school.id)

        let first = try store.addGoal(for: student, draft: percentDraft())
        let second = try store.addGoal(for: student, draft: percentDraft("Robin writes a sentence."))

        #expect(store.goals(for: student).map(\.id) == [first.id, second.id])
        #expect(first.sequence == 1)
        #expect(second.sequence == 2)
        #expect(store.addedIEPs.count == 1)
        #expect(store.addedIEPs.first?.status == .draft)
        #expect(store.student(for: first)?.id == student.id)
        let plan = try #require(store.plan(for: first))
        #expect(plan.type == .percentCorrect)
        #expect(plan.targetValue == 80)
        #expect(plan.unit == "percent")
        #expect(first.baseline == "40% correct")
        #expect(first.condition == nil)
    }

    @Test("a goal written for a student with a plan year joins it after the existing goals")
    func addingGoalToExistingStudent() throws {
        let store = try makeStore()
        store.signIn(as: try staff(store, .spedDirector))
        let student = try #require(store.visibleStudents.first { !store.goals(for: $0).isEmpty })
        let existing = store.goals(for: student)

        let goal = try store.addGoal(for: student, draft: percentDraft())

        #expect(store.addedIEPs.isEmpty)
        #expect(goal.iepID == existing.last?.iepID)
        #expect(goal.sequence == (existing.map(\.sequence).max() ?? 0) + 1)
        #expect(store.goals(for: student).count == existing.count + 1)
    }

    @Test("goal rules: who may write one, and what must be filled in")
    func addingGoalRules() throws {
        let store = try makeStore()
        let school = try #require(store.dataset.schools.first)
        let outside = try #require(store.dataset.students.first)
        #expect(throws: PrototypeStore.StoreError.notSignedIn) {
            try store.addGoal(for: outside, draft: percentDraft())
        }

        store.signIn(as: try staff(store, .paraprofessional))
        #expect(throws: PrototypeStore.StoreError.notAllowed) {
            try store.addGoal(for: outside, draft: percentDraft())
        }

        let manager = try staff(store, .caseManager)
        store.signIn(as: manager)
        let hidden = try #require(
            store.dataset.students.first { s in !store.visibleStudents.contains { $0.id == s.id } })
        #expect(throws: PrototypeStore.StoreError.notAllowed) {
            try store.addGoal(for: hidden, draft: percentDraft())
        }

        let student = try store.addStudent(
            firstName: "Robin", lastName: "Test", grade: "2", schoolID: school.id)
        var draft = percentDraft(" ")
        #expect(throws: PrototypeStore.StoreError.invalidGoal(.statementMissing)) {
            try store.addGoal(for: student, draft: draft)
        }
        draft = percentDraft(String(repeating: "x", count: PrototypeStore.maxStatementLength + 1))
        #expect(throws: PrototypeStore.StoreError.invalidGoal(.textTooLong)) {
            try store.addGoal(for: student, draft: draft)
        }
        draft = percentDraft()
        draft.baseline = String(repeating: "x", count: PrototypeStore.maxPartLength + 1)
        #expect(throws: PrototypeStore.StoreError.invalidGoal(.textTooLong)) {
            try store.addGoal(for: student, draft: draft)
        }
        draft = percentDraft()
        draft.targetValue = 101
        #expect(throws: PrototypeStore.StoreError.invalidGoal(.targetInvalid)) {
            try store.addGoal(for: student, draft: draft)
        }
        draft.targetValue = -1
        #expect(throws: PrototypeStore.StoreError.invalidGoal(.targetInvalid)) {
            try store.addGoal(for: student, draft: draft)
        }
        draft = percentDraft()
        draft.type = .trials
        draft.targetValue = 8
        #expect(throws: PrototypeStore.StoreError.invalidGoal(.trialsInvalid)) {
            try store.addGoal(for: student, draft: draft)
        }
        draft.trialsPerSession = 5
        #expect(throws: PrototypeStore.StoreError.invalidGoal(.targetInvalid)) {
            try store.addGoal(for: student, draft: draft)
        }
        draft = percentDraft()
        draft.type = .promptLevel
        draft.promptHierarchy = ["Independent", "  "]
        #expect(throws: PrototypeStore.StoreError.invalidGoal(.promptLevelsMissing)) {
            try store.addGoal(for: student, draft: draft)
        }
        draft.type = .taskAnalysis
        draft.taskSteps = [" "]
        #expect(throws: PrototypeStore.StoreError.invalidGoal(.stepsMissing)) {
            try store.addGoal(for: student, draft: draft)
        }
        #expect(store.addedGoals.isEmpty)
        #expect(store.addedPlans.isEmpty)
        #expect(store.addedIEPs.isEmpty)

        draft = percentDraft()
        draft.type = .promptLevel
        draft.targetValue = nil
        draft.promptHierarchy = ["Independent", "Verbal", ""]
        let goal = try store.addGoal(for: student, draft: draft)
        #expect(store.plan(for: goal)?.promptHierarchy == ["Independent", "Verbal"])
    }

    @Test("editing a goal changes its wording and plan, and the measure locks once data exists")
    func editingGoal() throws {
        let store = try makeStore()
        store.signIn(as: try staff(store, .spedDirector))
        let withData = try #require(
            store.visibleStudents.flatMap { store.goals(for: $0) }.first {
                store.plan(for: $0) != nil && !store.dataPoints(for: $0).isEmpty
            })
        let plan = try #require(store.plan(for: withData))

        var draft = GoalDraft(goal: withData, plan: plan)
        draft.statement = "A reworded goal."
        draft.targetValue = 3
        let changed = try store.updateGoal(id: withData.id, draft: draft)
        #expect(changed.statement == "A reworded goal.")
        #expect(changed.sequence == withData.sequence)
        let owner = try #require(store.student(for: withData))
        #expect(
            store.goals(for: owner).contains {
                $0.id == withData.id && $0.statement == "A reworded goal."
            })
        let edited = try #require(store.plan(for: changed))
        #expect(edited.id == plan.id)
        #expect(edited.targetValue == 3)

        draft.type = plan.type == .yesNo ? .rubric : .yesNo
        #expect(throws: PrototypeStore.StoreError.invalidGoal(.measurementLocked)) {
            try store.updateGoal(id: withData.id, draft: draft)
        }

        let school = try #require(store.dataset.schools.first)
        let student = try store.addStudent(
            firstName: "Robin", lastName: "Test", grade: "2", schoolID: school.id)
        let fresh = try store.addGoal(for: student, draft: percentDraft())
        var swap = GoalDraft(goal: fresh, plan: store.plan(for: fresh))
        swap.type = .yesNo
        swap.unit = ""
        swap.targetValue = nil
        try store.updateGoal(id: fresh.id, draft: swap)
        #expect(store.plan(for: fresh)?.type == .yesNo)

        #expect(throws: PrototypeStore.StoreError.unknownGoal) {
            try store.updateGoal(id: UUIDv7.make(), draft: percentDraft())
        }
    }

    @Test("once data exists, the trial count, prompt levels and steps cannot shrink or change")
    func editingPlanShapeWithData() throws {
        let store = try makeStore()
        store.signIn(as: try staff(store, .spedDirector))
        let goals = store.visibleStudents.flatMap { store.goals(for: $0) }
        func goal(_ type: MeasurementType) throws -> (Goal, MeasurementPlan) {
            let match = try #require(
                goals.first {
                    store.plan(for: $0)?.type == type && !store.dataPoints(for: $0).isEmpty
                })
            return (match, try #require(store.plan(for: match)))
        }

        let (trialsGoal, trialsPlan) = try goal(.trials)
        var trials = GoalDraft(goal: trialsGoal, plan: trialsPlan)
        trials.trialsPerSession = (trialsPlan.trialsPerSession ?? 10) + 1
        #expect(throws: PrototypeStore.StoreError.invalidGoal(.measurementLocked)) {
            try store.updateGoal(id: trialsGoal.id, draft: trials)
        }

        let (levelsGoal, levelsPlan) = try goal(.promptLevel)
        var levels = GoalDraft(goal: levelsGoal, plan: levelsPlan)
        levels.promptHierarchy = Array(levelsPlan.promptHierarchy.dropLast())
        #expect(throws: PrototypeStore.StoreError.invalidGoal(.measurementLocked)) {
            try store.updateGoal(id: levelsGoal.id, draft: levels)
        }
        levels.promptHierarchy = levelsPlan.promptHierarchy.reversed()
        #expect(throws: PrototypeStore.StoreError.invalidGoal(.measurementLocked)) {
            try store.updateGoal(id: levelsGoal.id, draft: levels)
        }
        levels.promptHierarchy = levelsPlan.promptHierarchy + ["Extra level"]
        try store.updateGoal(id: levelsGoal.id, draft: levels)
        #expect(store.plan(for: levelsGoal)?.promptHierarchy.last == "Extra level")

        let (stepsGoal, stepsPlan) = try goal(.taskAnalysis)
        var steps = GoalDraft(goal: stepsGoal, plan: stepsPlan)
        steps.taskSteps = Array(stepsPlan.taskSteps.dropFirst())
        #expect(throws: PrototypeStore.StoreError.invalidGoal(.measurementLocked)) {
            try store.updateGoal(id: stepsGoal.id, draft: steps)
        }
        steps.taskSteps = stepsPlan.taskSteps + ["Extra step"]
        try store.updateGoal(id: stepsGoal.id, draft: steps)
        #expect(store.plan(for: stepsGoal)?.taskSteps.last == "Extra step")
    }

    @Test("a person cannot edit a goal on a student outside their list")
    func editingGoalOutsideScope() throws {
        let store = try makeStore()
        store.signIn(as: try staff(store, .caseManager))
        let visible = Set(store.visibleStudents.map(\.id))
        let outside = try #require(
            store.dataset.goals.first { goal in
                guard let owner = store.student(for: goal) else { return false }
                return !visible.contains(owner.id)
            })
        #expect(throws: PrototypeStore.StoreError.notAllowed) {
            try store.updateGoal(id: outside.id, draft: percentDraft())
        }
    }

    @Test("hand-written and edited goals come back after a restart, and reset clears them")
    func goalPersistence() throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("iep-proto-\(UUID().uuidString)/state.json")
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }

        let first = try makeStore(stateURL: url)
        first.signIn(as: try staff(first, .spedDirector))
        let school = try #require(first.dataset.schools.first)
        let student = try first.addStudent(
            firstName: "Robin", lastName: "Test", grade: "2", schoolID: school.id)
        let goal = try first.addGoal(for: student, draft: percentDraft())
        var draft = GoalDraft(goal: goal, plan: first.plan(for: goal))
        draft.statement = "Changed after saving."
        try first.updateGoal(id: goal.id, draft: draft)

        let second = try makeStore(stateURL: url)
        second.signIn(as: try staff(second, .spedDirector))
        let back = try #require(second.goals(for: student).first)
        #expect(back.id == goal.id)
        #expect(back.statement == "Changed after saving.")
        #expect(second.plan(for: back)?.targetValue == 80)

        second.resetLocalData()
        let third = try makeStore(stateURL: url)
        #expect(third.addedGoals.isEmpty)
        #expect(third.addedPlans.isEmpty)
        #expect(third.addedIEPs.isEmpty)
        #expect(third.goalEdits.isEmpty)
        #expect(third.planEdits.isEmpty)
    }
}
