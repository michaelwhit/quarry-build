import CoreModels
import Foundation
import Testing

@testable import FeatureAIAssist

@Suite("MockProgressDrafter")
struct MockProgressDrafterTests {
    let tenant = UUIDv7.make()
    let goalID = UUIDv7.make()

    func goal() -> Goal {
        Goal(
            id: goalID, tenantID: tenant, iepID: UUIDv7.make(), area: .math,
            statement: "Given 10 problems, the student will write the sum.", sequence: 0)
    }

    func progress(_ values: [Double]) -> GoalProgress {
        let plan = MeasurementPlan(
            id: UUIDv7.make(), tenantID: tenant, goalID: goalID, type: .percentCorrect,
            unit: "percent", targetValue: 80)
        let start = Date(timeIntervalSince1970: 1_790_000_000)
        let points = values.enumerated().map { index, value in
            DataPoint(
                tenantID: tenant, goalID: goalID, planID: plan.id,
                observedAt: start.addingTimeInterval(Double(index) * 3.5 * 86_400), valueNum: value,
                collectorID: UUIDv7.make(), deviceID: UUIDv7.make())
        }
        return GoalProgress(plan: plan, dataPoints: points)
    }

    @Test("needs at least three sessions")
    func tooLittleData() {
        #expect(MockProgressDrafter.draft(for: goal(), progress: progress([40, 50])) == nil)
    }

    @Test("writes the numbers into a sufficient-progress comment")
    func sufficient() throws {
        let draft = try #require(
            MockProgressDrafter.draft(for: goal(), progress: progress([40, 55, 65, 72, 78])))
        #expect(draft.sufficient)
        #expect(draft.comment.contains("5 data sessions"))
        #expect(draft.comment.contains("71.7%"))
        #expect(draft.comment.contains("sufficient progress"))
        #expect(draft.citations.count >= 3)
        #expect(draft.provider == "mock-provider")
    }

    @Test("says not yet when progress is behind")
    func notSufficient() throws {
        let draft = try #require(
            MockProgressDrafter.draft(for: goal(), progress: progress([30, 28, 25, 22])))
        #expect(!draft.sufficient)
        #expect(draft.comment.contains("not yet making sufficient progress"))
    }

    @Test("keeps the student's name out of the draft until display")
    func deidentified() throws {
        let draft = try #require(
            MockProgressDrafter.draft(for: goal(), progress: progress([40, 55, 65, 72, 78])))
        #expect(draft.comment.contains(ProgressDraft.studentToken))
        let shown = draft.reidentified(as: "Wren")
        #expect(shown.contains("Wren"))
        #expect(!shown.contains(ProgressDraft.studentToken))
    }
}
