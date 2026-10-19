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
    public var dataPoints: [DataPoint]
    public var reportingPeriods: [ReportingPeriod]

    enum CodingKeys: String, CodingKey {
        case synthetic, seed, tenant, schools, staff, students, ieps, goals
        case generatorVersion = "generator_version"
        case caseloadAssignments = "caseload_assignments"
        case measurementPlans = "measurement_plans"
        case dataPoints = "data_points"
        case reportingPeriods = "reporting_periods"
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
