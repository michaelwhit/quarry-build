import Foundation

public struct Tenant: Identifiable, Hashable, Codable, Sendable {
    public var id: UUID
    public var name: String
    public var stateCode: String
    public var isSynthetic: Bool

    public init(id: UUID, name: String, stateCode: String = "NE", isSynthetic: Bool) {
        self.id = id
        self.name = name
        self.stateCode = stateCode
        self.isSynthetic = isSynthetic
    }

    enum CodingKeys: String, CodingKey {
        case id, name
        case stateCode = "state_code"
        case isSynthetic = "is_synthetic"
    }
}

public struct School: Identifiable, Hashable, Codable, Sendable {
    public var id: UUID
    public var tenantID: UUID
    public var name: String
    public var gradeSpan: String?

    public init(id: UUID, tenantID: UUID, name: String, gradeSpan: String? = nil) {
        self.id = id
        self.tenantID = tenantID
        self.name = name
        self.gradeSpan = gradeSpan
    }

    enum CodingKeys: String, CodingKey {
        case id, name
        case tenantID = "tenant_id"
        case gradeSpan = "grade_span"
    }
}

public struct Staff: Identifiable, Hashable, Codable, Sendable {
    public enum Status: String, Codable, Sendable {
        case active, suspended, deprovisioned
    }

    public var id: UUID
    public var tenantID: UUID
    public var email: String
    public var displayName: String
    public var role: StaffRole
    public var status: Status

    public init(
        id: UUID, tenantID: UUID, email: String, displayName: String, role: StaffRole,
        status: Status = .active
    ) {
        self.id = id
        self.tenantID = tenantID
        self.email = email
        self.displayName = displayName
        self.role = role
        self.status = status
    }

    enum CodingKeys: String, CodingKey {
        case id, email, role, status
        case tenantID = "tenant_id"
        case displayName = "display_name"
    }
}

/// A student record. Holds direct identifiers, so it lives only in the encrypted store and is
/// never logged, put in a notification, or sent to the AI gateway without de-identification.
public struct Student: Identifiable, Hashable, Codable, Sendable {
    public var id: UUID
    public var tenantID: UUID
    public var schoolID: UUID
    public var firstName: String
    public var lastName: String
    public var preferredName: String?
    public var grade: String
    public var localStudentID: String?
    public var stateStudentID: String?
    public var dateOfBirth: LocalDate?

    public init(
        id: UUID, tenantID: UUID, schoolID: UUID, firstName: String, lastName: String,
        preferredName: String? = nil, grade: String, localStudentID: String? = nil,
        stateStudentID: String? = nil, dateOfBirth: LocalDate? = nil
    ) {
        self.id = id
        self.tenantID = tenantID
        self.schoolID = schoolID
        self.firstName = firstName
        self.lastName = lastName
        self.preferredName = preferredName
        self.grade = grade
        self.localStudentID = localStudentID
        self.stateStudentID = stateStudentID
        self.dateOfBirth = dateOfBirth
    }

    /// The S1 display name: preferred name if set, otherwise first name and last initial.
    public var displayName: String {
        if let preferredName, !preferredName.isEmpty { return preferredName }
        guard let initial = lastName.first else { return firstName }
        return "\(firstName) \(initial)."
    }

    enum CodingKeys: String, CodingKey {
        case id, grade
        case tenantID = "tenant_id"
        case schoolID = "school_id"
        case firstName = "first_name"
        case lastName = "last_name"
        case preferredName = "preferred_name"
        case localStudentID = "local_student_id"
        case stateStudentID = "state_student_id"
        case dateOfBirth = "dob"
    }
}

/// The relationship that gives a staff member access to a student (security design 3.1).
public struct CaseloadAssignment: Identifiable, Hashable, Codable, Sendable {
    public enum Relationship: String, Codable, Sendable {
        case caseload
        case service
        case classRoster = "class_roster"
        case delegated
    }

    public var id: UUID
    public var tenantID: UUID
    public var staffID: UUID
    public var studentID: UUID
    public var relationship: Relationship
    public var grantedBy: UUID
    public var startDate: LocalDate
    public var endDate: LocalDate?

    public init(
        id: UUID, tenantID: UUID, staffID: UUID, studentID: UUID, relationship: Relationship,
        grantedBy: UUID, startDate: LocalDate, endDate: LocalDate? = nil
    ) {
        self.id = id
        self.tenantID = tenantID
        self.staffID = staffID
        self.studentID = studentID
        self.relationship = relationship
        self.grantedBy = grantedBy
        self.startDate = startDate
        self.endDate = endDate
    }

    /// Whether the assignment grants access on the given date.
    public func isActive(on date: LocalDate) -> Bool {
        guard startDate <= date else { return false }
        if let endDate { return date <= endDate }
        return true
    }

    enum CodingKeys: String, CodingKey {
        case id, relationship
        case tenantID = "tenant_id"
        case staffID = "staff_id"
        case studentID = "student_id"
        case grantedBy = "granted_by"
        case startDate = "start_date"
        case endDate = "end_date"
    }
}

extension StaffRole {
    /// A teacher-facing name for the role.
    public var title: String {
        switch self {
        case .spedDirector: "SPED director"
        case .buildingCoordinator: "Building SPED coordinator"
        case .caseManager: "Case manager"
        case .relatedServiceProvider: "Related-service provider"
        case .genEdTeacher: "General-education teacher"
        case .paraprofessional: "Paraprofessional"
        case .districtITAdmin: "District IT admin"
        case .vendorSupport: "Vendor support"
        }
    }
}
