import CoreModels
import Foundation

@testable import FeatureSession

/// Whole-second dates, so a JSON round trip (ISO 8601) compares equal.
let t0 = Date(timeIntervalSince1970: 1_790_000_000)

final class TestClock: @unchecked Sendable {
    var now: Date
    init(_ now: Date = t0) { self.now = now }
    func advance(_ seconds: TimeInterval) { now = now.addingTimeInterval(seconds) }
}

enum Fixture {
    static let tenant = UUIDv7.make()
    static let staff = UUIDv7.make()
    static let device = UUIDv7.make()
    static let context = CommitContext(tenantID: tenant, collectorID: staff, deviceID: device)

    static func student(_ first: String = "Maya", _ last: String = "Lindqvist") -> Student {
        Student(
            id: UUIDv7.make(), tenantID: tenant, schoolID: UUIDv7.make(), firstName: first,
            lastName: last, grade: "2")
    }

    static func goal(
        for student: Student, type: MeasurementType, unit: String? = nil, target: Double? = nil,
        trials: Int? = nil, prompts: [String] = [], sequence: Int = 1, history: [Double] = []
    ) -> SessionGoal {
        let goalID = UUIDv7.make()
        let goal = Goal(
            id: goalID, tenantID: tenant, iepID: UUIDv7.make(), area: .reading,
            statement: "Read CVC words", sequence: sequence)
        let plan = MeasurementPlan(
            id: UUIDv7.make(), tenantID: tenant, goalID: goalID, type: type, unit: unit,
            targetValue: target, trialsPerSession: trials, promptHierarchy: prompts)
        let points = history.enumerated().map { index, value -> DataPoint in
            let at = t0.addingTimeInterval(Double(index - history.count) * 86_400)
            switch type {
            case .trials, .yesNo:
                return DataPoint(
                    tenantID: tenant, goalID: goalID, planID: plan.id, observedAt: at,
                    correct: Int(value), total: 10, collectorID: staff, deviceID: device)
            default:
                return DataPoint(
                    tenantID: tenant, goalID: goalID, planID: plan.id, observedAt: at,
                    valueNum: value, collectorID: staff, deviceID: device)
            }
        }
        return SessionGoal(student: student, goal: goal, plan: plan, history: points)
    }

    static func draft(_ goals: [SessionGoal]) -> SessionDraft {
        SessionDraft.start(goals: goals, at: t0)
    }
}
