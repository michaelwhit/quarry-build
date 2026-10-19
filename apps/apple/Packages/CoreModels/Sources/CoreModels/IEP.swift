import Foundation

public struct IEP: Identifiable, Hashable, Codable, Sendable {
    /// SRS holds the legal version; the app tracks where the draft is.
    public enum Status: String, Codable, Sendable {
        case draft
        case readyForSRS = "ready_for_srs"
        case enteredInSRS = "entered_in_srs"
        case expired
    }

    public enum Kind: String, Codable, Sendable {
        case initial, annual, amendment, transfer
    }

    public var id: UUID
    public var tenantID: UUID
    public var studentID: UUID
    public var status: Status
    public var kind: Kind
    public var formVersion: String
    public var meetingDate: LocalDate?
    public var effectiveFrom: LocalDate?
    public var effectiveTo: LocalDate?
    public var annualReviewDue: LocalDate?
    public var reevaluationDue: LocalDate?

    public init(
        id: UUID, tenantID: UUID, studentID: UUID, status: Status, kind: Kind,
        formVersion: String = "nde_v2", meetingDate: LocalDate? = nil,
        effectiveFrom: LocalDate? = nil, effectiveTo: LocalDate? = nil,
        annualReviewDue: LocalDate? = nil, reevaluationDue: LocalDate? = nil
    ) {
        self.id = id
        self.tenantID = tenantID
        self.studentID = studentID
        self.status = status
        self.kind = kind
        self.formVersion = formVersion
        self.meetingDate = meetingDate
        self.effectiveFrom = effectiveFrom
        self.effectiveTo = effectiveTo
        self.annualReviewDue = annualReviewDue
        self.reevaluationDue = reevaluationDue
    }

    enum CodingKeys: String, CodingKey {
        case id, status
        case kind = "type"
        case tenantID = "tenant_id"
        case studentID = "student_id"
        case formVersion = "form_version"
        case meetingDate = "meeting_date"
        case effectiveFrom = "effective_from"
        case effectiveTo = "effective_to"
        case annualReviewDue = "annual_review_due"
        case reevaluationDue = "reevaluation_due"
    }
}

public enum GoalArea: String, Codable, Sendable, CaseIterable {
    case reading
    case writtenExpression = "written_expression"
    case math
    case communication
    case socialEmotional = "social_emotional"
    case behavior
    case adaptive
    case motor
    case transition
    case other
}

/// An annual goal. State goals have a condition, a behavior and criteria (NDE model IEP).
public struct Goal: Identifiable, Hashable, Codable, Sendable {
    public var id: UUID
    public var tenantID: UUID
    public var iepID: UUID
    public var area: GoalArea
    public var statement: String
    public var condition: String?
    public var behavior: String?
    public var baseline: String?
    public var target: String?
    public var criteria: String?
    public var sequence: Int

    public init(
        id: UUID, tenantID: UUID, iepID: UUID, area: GoalArea, statement: String,
        condition: String? = nil, behavior: String? = nil, baseline: String? = nil,
        target: String? = nil, criteria: String? = nil, sequence: Int
    ) {
        self.id = id
        self.tenantID = tenantID
        self.iepID = iepID
        self.area = area
        self.statement = statement
        self.condition = condition
        self.behavior = behavior
        self.baseline = baseline
        self.target = target
        self.criteria = criteria
        self.sequence = sequence
    }

    enum CodingKeys: String, CodingKey {
        case id, area, statement, condition, behavior, baseline, target, criteria, sequence
        case tenantID = "tenant_id"
        case iepID = "iep_id"
    }
}

public enum MeasurementType: String, Codable, Sendable, CaseIterable {
    case percentCorrect = "percent_correct"
    case trials
    case frequency
    case rate
    case duration
    case latency
    case rubric
    case promptLevel = "prompt_level"
    case taskAnalysis = "task_analysis"
    case yesNo = "yes_no"
}

/// How data is collected for a goal: the shape of its data sheet.
public struct MeasurementPlan: Identifiable, Hashable, Codable, Sendable {
    public var id: UUID
    public var tenantID: UUID
    public var goalID: UUID
    public var objectiveID: UUID?
    public var type: MeasurementType
    public var unit: String?
    public var targetValue: Double?
    public var trialsPerSession: Int?
    public var promptHierarchy: [String]
    public var taskSteps: [String]
    public var frequency: String?

    public init(
        id: UUID, tenantID: UUID, goalID: UUID, objectiveID: UUID? = nil, type: MeasurementType,
        unit: String? = nil, targetValue: Double? = nil, trialsPerSession: Int? = nil,
        promptHierarchy: [String] = [], taskSteps: [String] = [], frequency: String? = nil
    ) {
        self.id = id
        self.tenantID = tenantID
        self.goalID = goalID
        self.objectiveID = objectiveID
        self.type = type
        self.unit = unit
        self.targetValue = targetValue
        self.trialsPerSession = trialsPerSession
        self.promptHierarchy = promptHierarchy
        self.taskSteps = taskSteps
        self.frequency = frequency
    }

    enum CodingKeys: String, CodingKey {
        case id, type, unit, frequency
        case tenantID = "tenant_id"
        case goalID = "goal_id"
        case objectiveID = "objective_id"
        case targetValue = "target_value"
        case trialsPerSession = "trials_per_session"
        case promptHierarchy = "prompt_hierarchy"
        case taskSteps = "task_steps"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        tenantID = try c.decode(UUID.self, forKey: .tenantID)
        goalID = try c.decode(UUID.self, forKey: .goalID)
        objectiveID = try c.decodeIfPresent(UUID.self, forKey: .objectiveID)
        type = try c.decode(MeasurementType.self, forKey: .type)
        unit = try c.decodeIfPresent(String.self, forKey: .unit)
        targetValue = try c.decodeIfPresent(Double.self, forKey: .targetValue)
        trialsPerSession = try c.decodeIfPresent(Int.self, forKey: .trialsPerSession)
        promptHierarchy = try c.decodeIfPresent([String].self, forKey: .promptHierarchy) ?? []
        taskSteps = try c.decodeIfPresent([String].self, forKey: .taskSteps) ?? []
        frequency = try c.decodeIfPresent(String.self, forKey: .frequency)
    }
}

/// A school's progress-report date, keyed to the reports SRS creates.
public struct ReportingPeriod: Identifiable, Hashable, Codable, Sendable {
    public var id: UUID
    public var tenantID: UUID
    public var schoolID: UUID
    public var schoolYear: String
    public var srsReportDate: LocalDate

    public init(
        id: UUID, tenantID: UUID, schoolID: UUID, schoolYear: String, srsReportDate: LocalDate
    ) {
        self.id = id
        self.tenantID = tenantID
        self.schoolID = schoolID
        self.schoolYear = schoolYear
        self.srsReportDate = srsReportDate
    }

    enum CodingKeys: String, CodingKey {
        case id
        case tenantID = "tenant_id"
        case schoolID = "school_id"
        case schoolYear = "school_year"
        case srsReportDate = "srs_report_date"
    }
}

extension GoalArea {
    /// A teacher-facing name for the goal area.
    public var title: String {
        switch self {
        case .reading: "Reading"
        case .writtenExpression: "Written expression"
        case .math: "Math"
        case .communication: "Communication"
        case .socialEmotional: "Social-emotional"
        case .behavior: "Behavior"
        case .adaptive: "Adaptive"
        case .motor: "Motor"
        case .transition: "Transition"
        case .other: "Other"
        }
    }
}

extension MeasurementType {
    /// A teacher-facing name for the way data is collected.
    public var title: String {
        switch self {
        case .percentCorrect: "Percent correct"
        case .trials: "Trials correct"
        case .frequency: "Frequency count"
        case .rate: "Rate"
        case .duration: "Duration"
        case .latency: "Latency"
        case .rubric: "Rubric score"
        case .promptLevel: "Prompt level"
        case .taskAnalysis: "Task analysis"
        case .yesNo: "Yes / no"
        }
    }
}
