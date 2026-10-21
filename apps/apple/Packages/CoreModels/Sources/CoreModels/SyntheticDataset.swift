import Foundation

/// The fake district produced by `packages/synthetic-data` (fixtures/demo-district.json).
///
/// Demo builds seed their on-device store from it, and tests use it as the cross-language
/// contract check between the TypeScript generator and these models.
public struct SyntheticDataset: Codable, Sendable {
    public enum LoadError: Error, Equatable {
        /// The file is not marked synthetic. Never load it: it could hold real records.
        case notSynthetic
    }

    public var synthetic: Bool
    public var seed: Int
    public var generatorVersion: String
    public var tenant: Tenant
    public var schools: [School]
    public var staff: [Staff]
    public var students: [Student]
    public var caseloadAssignments: [CaseloadAssignment]
    public var ieps: [IEP]
    public var goals: [Goal]
    public var measurementPlans: [MeasurementPlan]
    /// Goals handed to a para or general-education teacher. Older files do not have this key.
    public var goalDelegations: [GoalDelegation] = []
    public var dataPoints: [DataPoint]
    public var reportingPeriods: [ReportingPeriod]
    /// Absent in older files, which then have no progress reports.
    public var schoolCalendar: SchoolCalendar?
    public var progressReports: [ProgressReport] = []

    enum CodingKeys: String, CodingKey {
        case synthetic, seed, tenant, schools, staff, students, ieps, goals
        case generatorVersion = "generator_version"
        case caseloadAssignments = "caseload_assignments"
        case measurementPlans = "measurement_plans"
        case goalDelegations = "goal_delegations"
        case dataPoints = "data_points"
        case reportingPeriods = "reporting_periods"
        case schoolCalendar = "school_calendar"
        case progressReports = "progress_reports"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        synthetic = try c.decode(Bool.self, forKey: .synthetic)
        seed = try c.decode(Int.self, forKey: .seed)
        generatorVersion = try c.decode(String.self, forKey: .generatorVersion)
        tenant = try c.decode(Tenant.self, forKey: .tenant)
        schools = try c.decode([School].self, forKey: .schools)
        staff = try c.decode([Staff].self, forKey: .staff)
        students = try c.decode([Student].self, forKey: .students)
        caseloadAssignments = try c.decode([CaseloadAssignment].self, forKey: .caseloadAssignments)
        ieps = try c.decode([IEP].self, forKey: .ieps)
        goals = try c.decode([Goal].self, forKey: .goals)
        measurementPlans = try c.decode([MeasurementPlan].self, forKey: .measurementPlans)
        goalDelegations =
            try c.decodeIfPresent([GoalDelegation].self, forKey: .goalDelegations) ?? []
        dataPoints = try c.decode([DataPoint].self, forKey: .dataPoints)
        reportingPeriods = try c.decode([ReportingPeriod].self, forKey: .reportingPeriods)
        schoolCalendar = try c.decodeIfPresent(SchoolCalendar.self, forKey: .schoolCalendar)
        progressReports =
            try c.decodeIfPresent([ProgressReport].self, forKey: .progressReports) ?? []
    }

    /// Decodes a dataset and refuses anything not marked synthetic at both the file and the
    /// tenant level.
    public static func load(from data: Data) throws -> SyntheticDataset {
        let dataset = try JSONDecoder.coreModels.decode(SyntheticDataset.self, from: data)
        guard dataset.synthetic, dataset.tenant.isSynthetic else { throw LoadError.notSynthetic }
        return dataset
    }
}

extension JSONDecoder {
    /// A decoder for the API and fixture formats (ISO 8601 timestamps, explicit snake_case keys).
    public static var coreModels: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}

extension JSONEncoder {
    /// An encoder matching `JSONDecoder.coreModels`.
    public static var coreModels: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }
}
