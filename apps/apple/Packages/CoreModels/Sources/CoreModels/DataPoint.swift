import Foundation

/// One observation for a goal. Append-only: a correction is a new data point whose
/// `correctsID` names the one it replaces, so sync never has to merge edits.
public struct DataPoint: Identifiable, Hashable, Codable, Sendable {
    /// The longest note a data point may carry, matching the database check.
    public static let maxNoteLength = 2000

    public var id: UUID
    public var tenantID: UUID
    public var goalID: UUID
    public var objectiveID: UUID?
    public var planID: UUID
    public var observedAt: Date
    public var valueNum: Double?
    public var correct: Int?
    public var total: Int?
    public var promptLevel: String?
    public var stepResults: [Bool]?
    public var setting: String?
    public var note: String?
    public var collectorID: UUID
    public var deviceID: UUID
    public var clientCreatedAt: Date
    public var correctsID: UUID?

    public init(
        id: UUID = UUIDv7.make(), tenantID: UUID, goalID: UUID, objectiveID: UUID? = nil,
        planID: UUID, observedAt: Date, valueNum: Double? = nil, correct: Int? = nil,
        total: Int? = nil, promptLevel: String? = nil, stepResults: [Bool]? = nil,
        setting: String? = nil, note: String? = nil, collectorID: UUID, deviceID: UUID,
        clientCreatedAt: Date = Date(), correctsID: UUID? = nil
    ) {
        self.id = id
        self.tenantID = tenantID
        self.goalID = goalID
        self.objectiveID = objectiveID
        self.planID = planID
        self.observedAt = observedAt
        self.valueNum = valueNum
        self.correct = correct
        self.total = total
        self.promptLevel = promptLevel
        self.stepResults = stepResults
        self.setting = setting
        self.note = note
        self.collectorID = collectorID
        self.deviceID = deviceID
        self.clientCreatedAt = clientCreatedAt
        self.correctsID = correctsID
    }

    enum CodingKeys: String, CodingKey {
        case id, correct, total, setting, note
        case tenantID = "tenant_id"
        case goalID = "goal_id"
        case objectiveID = "objective_id"
        case planID = "plan_id"
        case observedAt = "observed_at"
        case valueNum = "value_num"
        case promptLevel = "prompt_level"
        case stepResults = "step_results"
        case collectorID = "collector_id"
        case deviceID = "device_id"
        case clientCreatedAt = "client_created_at"
        case correctsID = "corrects_id"
    }
}

/// Why a data point does not fit its measurement plan.
public enum DataPointValidationError: Error, Equatable, Sendable {
    case wrongPlan
    case missingValue(MeasurementType)
    case correctExceedsTotal
    case negativeValue
    case percentOutOfRange
    case stepCountMismatch(expected: Int, actual: Int)
    case unknownPromptLevel(String)
    case noteTooLong
}

extension DataPoint {
    /// Checks this data point against the plan it was recorded for. The server repeats the same
    /// checks; validating on the device first gives the teacher an immediate answer offline.
    public func validate(against plan: MeasurementPlan) throws {
        typealias Failure = DataPointValidationError
        guard plan.id == planID, plan.goalID == goalID else { throw Failure.wrongPlan }
        if let note, note.count > Self.maxNoteLength { throw Failure.noteTooLong }
        if let correct, correct < 0 { throw Failure.negativeValue }
        if let total, total < 0 { throw Failure.negativeValue }
        if let correct, let total, correct > total { throw Failure.correctExceedsTotal }
        if let valueNum, valueNum < 0 { throw Failure.negativeValue }

        switch plan.type {
        case .percentCorrect:
            guard let valueNum else { throw Failure.missingValue(plan.type) }
            guard valueNum <= 100 else { throw Failure.percentOutOfRange }
        case .trials, .yesNo:
            guard correct != nil, total != nil else { throw Failure.missingValue(plan.type) }
        case .taskAnalysis:
            guard let stepResults else { throw Failure.missingValue(plan.type) }
            guard stepResults.count == plan.taskSteps.count else {
                throw Failure.stepCountMismatch(
                    expected: plan.taskSteps.count, actual: stepResults.count)
            }
        case .promptLevel:
            guard let promptLevel else { throw Failure.missingValue(plan.type) }
            guard plan.promptHierarchy.contains(promptLevel) else {
                throw Failure.unknownPromptLevel(promptLevel)
            }
        case .frequency, .rate, .duration, .latency, .rubric:
            guard valueNum != nil else { throw Failure.missingValue(plan.type) }
        }
    }

    /// The observation as a fraction of the plan's target (0 means none, 1 means target met),
    /// or nil when the plan has no numeric target. Used for graphs and the Sufficient rule.
    public func progressFraction(for plan: MeasurementPlan) -> Double? {
        switch plan.type {
        case .trials, .yesNo, .taskAnalysis:
            guard let correct, let total, total > 0 else { return nil }
            let target = plan.targetValue ?? Double(total)
            guard target > 0 else { return nil }
            return Double(correct) / target
        case .promptLevel:
            guard let promptLevel, let index = plan.promptHierarchy.firstIndex(of: promptLevel),
                plan.promptHierarchy.count > 1
            else { return nil }
            return Double(index) / Double(plan.promptHierarchy.count - 1)
        case .percentCorrect, .frequency, .rate, .duration, .rubric:
            guard let valueNum, let target = plan.targetValue, target > 0 else { return nil }
            return valueNum / target
        case .latency:
            // Lower is better: meeting the target latency or faster counts as 1.
            guard let valueNum, valueNum > 0, let target = plan.targetValue else { return nil }
            return target / valueNum
        }
    }
}
