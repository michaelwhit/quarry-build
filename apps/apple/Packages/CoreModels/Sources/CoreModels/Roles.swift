/// Staff roles from security design section 3.3.
public enum StaffRole: String, Codable, Sendable, CaseIterable {
    case spedDirector = "sped_director"
    case buildingCoordinator = "building_coordinator"
    case caseManager = "case_manager"
    case relatedServiceProvider = "related_service_provider"
    case genEdTeacher = "gen_ed_teacher"
    case paraprofessional = "paraprofessional"
    case districtITAdmin = "district_it_admin"
    case vendorSupport = "vendor_support"
}

/// Record sensitivity tiers from security design section 3.2.
///
/// S5 never syncs to a device; S4 is cached only for recently opened students.
public enum SensitivityTier: Int, Codable, Sendable, Comparable, CaseIterable {
    /// Preferred name, grade, school.
    case s1 = 1
    /// Accommodations, assigned goals (text only).
    case s2 = 2
    /// Goal progress data points, service logs.
    case s3 = 3
    /// Full IEP.
    case s4 = 4
    /// Evaluations, disability category, health, discipline.
    case s5 = 5

    public static func < (lhs: SensitivityTier, rhs: SensitivityTier) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    /// Whether rows of this tier may be stored on a device at all.
    public var mayBeCachedOnDevice: Bool { self != .s5 }
}
