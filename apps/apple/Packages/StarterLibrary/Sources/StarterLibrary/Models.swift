import Foundation

/// Library content model (spec libraries-and-monitoring-spec.md sections 2, 3, 7). No student data.
/// Decoded with `.convertFromSnakeCase`, so property names are the camel-case form of the wire names.

public struct TaxonomyNode: Codable, Sendable, Hashable, Identifiable {
    public var id: String
    public var parentId: String?
    public var level: String
    public var name: String
    public var goalArea: String?
    public var synonyms: [String]
    public var sort: Double
}

public struct Provenance: Codable, Sendable, Hashable {
    public var origin: String
    public var author: String
    public var reviewer: String?
    public var reviewedOn: String?
}

public struct Slot: Codable, Sendable, Hashable {
    public var name: String
    public var kind: String
    public var `default`: String?
    public var choices: [String]?
    public var help: String?
}

public struct Mastery: Codable, Sendable, Hashable {
    /// Nil when `thresholdFromSlot` names the number slot that supplies it.
    public var threshold: Double?
    public var thresholdFromSlot: String?
    public var unit: String?
    public var comparator: String
    public var windowKind: String
    public var windowCount: Int
    public var windowOf: Int
    public var promptCeiling: String?
    public var maintenanceCheck: Bool
}

public struct MeasurementPlanTemplate: Codable, Sendable, Hashable {
    public var method: String
    public var secondaryMethod: String?
    public var unit: String?
    public var trialsPerSession: Int?
    public var promptHierarchy: [String]?
    public var taskSteps: [String]?
    public var intervalSeconds: Int?
    public var probeSeconds: Int?
    public var rubricLevels: [String]?
}

public struct GoalTemplate: Codable, Sendable, Hashable, Identifiable {
    public var id: String
    public var version: Int
    public var skillIds: [String]
    public var gradeBands: [String]
    public var title: String
    public var templateText: String
    public var conditionText: String
    public var behaviorText: String
    public var slots: [Slot]
    public var measurementPlanTemplate: MeasurementPlanTemplate
    public var mastery: Mastery
    public var objectiveLadder: [String]
    public var baselineGuidance: String?
    /// Replacement-behavior wording: ask the teacher to confirm the FBA and BIP exist.
    public var requiresFbaBip: Bool?
    public var iepAddresses: [String]?
    public var progressMeasuredBy: [String]?
    public var standardRefs: [String]
    public var deficitTags: [String]
    public var relatedAccommodationIds: [String]
    public var discipline: String
    public var provenance: Provenance
}

public struct DefaultLfd: Codable, Sendable, Hashable {
    public var location: String?
    public var frequency: String?
    /// The projected span ("for the duration of this IEP").
    public var duration: String?
    /// NDE duration of service per occurrence ("30 minutes per occurrence").
    public var durationPerOccurrence: String?
}

public struct AccommodationTemplate: Codable, Sendable, Hashable, Identifiable {
    public var id: String
    public var version: Int
    public var kind: String
    public var category: String
    public var title: String
    public var description: String
    public var needTags: [String]
    public var skillIds: [String]
    public var requiresFbaBip: Bool?
    public var modificationWarning: String?
    public var defaultLfd: DefaultLfd
    public var srsChecklistItem: String?
    public var provenance: Provenance
}

public struct LfdPhrase: Codable, Sendable, Hashable, Identifiable {
    public var id: String
    public var part: String
    public var text: String
    public var slots: [Slot]
}

/// The signed content, everything the app browses offline.
public struct StarterLibraryContent: Codable, Sendable {
    public var schemaVersion: Int
    public var bundleVersion: Int
    public var createdAt: String
    public var taxonomy: [TaxonomyNode]
    public var goals: [GoalTemplate]
    public var accommodations: [AccommodationTemplate]
    public var phrases: [LfdPhrase]

    /// The district's hide list: hidden items leave browsing and suggestions. The bundle is never edited.
    public func hiding(_ hidden: Set<String>) -> StarterLibraryContent {
        var copy = self
        copy.goals = goals.filter { !hidden.contains($0.id) }.map {
            var g = $0
            g.relatedAccommodationIds = g.relatedAccommodationIds.filter { !hidden.contains($0) }
            return g
        }
        copy.accommodations = accommodations.filter { !hidden.contains($0.id) }
        copy.phrases = phrases.filter { !hidden.contains($0.id) }
        return copy
    }
}
