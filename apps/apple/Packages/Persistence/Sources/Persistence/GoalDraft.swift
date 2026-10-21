import CoreModels
import Foundation

/// Everything typed into the goal form: the goal's parts and how its data will be collected.
/// Blank text means "not filled in".
public struct GoalDraft: Equatable, Sendable {
    public var area: GoalArea
    public var statement: String
    public var condition: String
    public var behavior: String
    public var baseline: String
    public var target: String
    public var criteria: String
    public var type: MeasurementType
    public var unit: String
    public var targetValue: Double?
    public var trialsPerSession: Int?
    public var frequency: String
    public var promptHierarchy: [String]
    public var taskSteps: [String]

    public init(
        area: GoalArea = .reading, statement: String = "", condition: String = "",
        behavior: String = "", baseline: String = "", target: String = "", criteria: String = "",
        type: MeasurementType = .percentCorrect, unit: String = "", targetValue: Double? = nil,
        trialsPerSession: Int? = nil, frequency: String = "", promptHierarchy: [String] = [],
        taskSteps: [String] = []
    ) {
        self.area = area
        self.statement = statement
        self.condition = condition
        self.behavior = behavior
        self.baseline = baseline
        self.target = target
        self.criteria = criteria
        self.type = type
        self.unit = unit
        self.targetValue = targetValue
        self.trialsPerSession = trialsPerSession
        self.frequency = frequency
        self.promptHierarchy = promptHierarchy
        self.taskSteps = taskSteps
    }

    /// A draft that starts from an existing goal and its data plan.
    public init(goal: Goal, plan: MeasurementPlan?) {
        self.init(
            area: goal.area, statement: goal.statement, condition: goal.condition ?? "",
            behavior: goal.behavior ?? "", baseline: goal.baseline ?? "",
            target: goal.target ?? "", criteria: goal.criteria ?? "",
            type: plan?.type ?? .percentCorrect, unit: plan?.unit ?? "",
            targetValue: plan?.targetValue, trialsPerSession: plan?.trialsPerSession,
            frequency: plan?.frequency ?? "", promptHierarchy: plan?.promptHierarchy ?? [],
            taskSteps: plan?.taskSteps ?? [])
    }

    func goal(id: UUID, tenantID: UUID, iepID: UUID, sequence: Int) -> Goal {
        Goal(
            id: id, tenantID: tenantID, iepID: iepID, area: area, statement: statement,
            condition: Self.optional(condition), behavior: Self.optional(behavior),
            baseline: Self.optional(baseline), target: Self.optional(target),
            criteria: Self.optional(criteria), sequence: sequence)
    }

    func plan(id: UUID, tenantID: UUID, goalID: UUID, objectiveID: UUID? = nil) -> MeasurementPlan {
        MeasurementPlan(
            id: id, tenantID: tenantID, goalID: goalID, objectiveID: objectiveID, type: type,
            unit: Self.optional(unit), targetValue: targetValue, trialsPerSession: trialsPerSession,
            promptHierarchy: promptHierarchy, taskSteps: taskSteps,
            frequency: Self.optional(frequency))
    }

    private static func optional(_ text: String) -> String? { text.isEmpty ? nil : text }
}
