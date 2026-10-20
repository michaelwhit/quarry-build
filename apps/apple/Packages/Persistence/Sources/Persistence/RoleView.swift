import CoreModels
import Foundation

/// How the first screen is laid out.
public enum HomeStyle: Equatable, Sendable {
    /// Caseload numbers, then a tile for each feature the role may use.
    case numbersAndTiles
    /// One list of the goals to work on today and a button to start a session.
    case goalsToday
}

/// How much of the caseload a role can see. Same names and meanings as the role provider's
/// `StudentScope`; the server decides what is really returned.
public enum StudentScope: String, Codable, Sendable, Equatable {
    case allStudents
    case building
    case caseload
    case servedStudents
    case delegatedGoals
    case none
}

/// What a role may do, as the role provider reports it. This is a local copy of the provider's
/// `RoleCapabilities` with the same field names and meanings, so that when the provider is
/// available here this struct is deleted, the provider's is imported, and `RoleView` is built the
/// same way. Hiding a control is a convenience; the server refuses what a role may not do.
public struct RoleCapabilities: Codable, Sendable, Equatable {
    public var role: StaffRole
    public var scope: StudentScope
    public var canRecordData: Bool
    public var canUseAI: Bool
    public var canEditIEP: Bool
    public var canExport: Bool
    public var canDelegateGoals: Bool
    public var canManageStaff: Bool
    public var canSeeFullIEP: Bool
    public var canSeeEvaluations: Bool
    public var minimizedStudentView: Bool
    public var iPhoneOnly: Bool
    /// True until the SPED director has signed off on this role's defaults.
    public var isProposedDefault: Bool

    public init(
        role: StaffRole, scope: StudentScope, canRecordData: Bool, canUseAI: Bool,
        canEditIEP: Bool, canExport: Bool, canDelegateGoals: Bool, canManageStaff: Bool,
        canSeeFullIEP: Bool, canSeeEvaluations: Bool, minimizedStudentView: Bool,
        iPhoneOnly: Bool, isProposedDefault: Bool = true
    ) {
        self.role = role
        self.scope = scope
        self.canRecordData = canRecordData
        self.canUseAI = canUseAI
        self.canEditIEP = canEditIEP
        self.canExport = canExport
        self.canDelegateGoals = canDelegateGoals
        self.canManageStaff = canManageStaff
        self.canSeeFullIEP = canSeeFullIEP
        self.canSeeEvaluations = canSeeEvaluations
        self.minimizedStudentView = minimizedStudentView
        self.iPhoneOnly = iPhoneOnly
        self.isProposedDefault = isProposedDefault
    }

    /// The proposed defaults for each role.
    public static func proposedDefaults(for role: StaffRole) -> RoleCapabilities {
        func make(
            _ scope: StudentScope, record: Bool = true, ai: Bool = false, edit: Bool = false,
            export: Bool = false, delegate: Bool = false, staff: Bool = false, iep: Bool = false,
            evals: Bool = false, minimized: Bool = false, phone: Bool = false
        ) -> RoleCapabilities {
            RoleCapabilities(
                role: role, scope: scope, canRecordData: record, canUseAI: ai, canEditIEP: edit,
                canExport: export, canDelegateGoals: delegate, canManageStaff: staff,
                canSeeFullIEP: iep, canSeeEvaluations: evals, minimizedStudentView: minimized,
                iPhoneOnly: phone)
        }
        switch role {
        case .spedDirector:
            return make(
                .allStudents, ai: true, edit: true, export: true, delegate: true, staff: true,
                iep: true, evals: true)
        case .buildingCoordinator:
            return make(.building, edit: true, export: true, iep: true, evals: true)
        case .caseManager:
            return make(
                .caseload, ai: true, edit: true, export: true, delegate: true, iep: true,
                evals: true)
        case .relatedServiceProvider:
            return make(.servedStudents, ai: true, iep: true)
        case .genEdTeacher:
            return make(.delegatedGoals)
        case .paraprofessional:
            return make(.delegatedGoals, minimized: true, phone: true)
        case .districtITAdmin, .vendorSupport:
            return make(.none, record: false, minimized: true)
        }
    }
}

/// What the signed-in role sees and may do. Screens ask this and never look at the role itself,
/// so a control the role may not use is left out, not greyed. The server decides what data a role
/// receives; this only decides what the screens show. It is built from the role's capabilities,
/// so changing where those come from changes nothing on the screens.
public struct RoleView: Equatable, Sendable {
    /// "SPED teacher", "SPED director" and so on, for the More screen.
    public var roleName: String
    public var homeStyle: HomeStyle
    public var showsToday: Bool
    public var showsCaseload: Bool
    public var showsLibraries: Bool
    public var showsGraphs: Bool
    /// "Caseload" or "My students".
    public var caseloadTitle: String
    /// False shows a student by first (or preferred) name only.
    public var showsFullNames: Bool
    public var canDraft: Bool
    public var canApprove: Bool
    public var canExport: Bool
    public var canUseAI: Bool
    /// Give data entry on a goal to a paraprofessional.
    public var canDelegate: Bool
    /// Assign roles and caseloads (Staff and roles).
    public var canManageStaff: Bool
    /// See who has access to what.
    public var canReviewAccess: Bool
    /// The full IEP (tier S4) and evaluations (tier S5); a screen with neither shows
    /// "Not shared with your role" in a muted line.
    public var canSeeFullIEP: Bool
    public var canSeeEvaluations: Bool
    /// True when this role works from an iPhone only.
    public var iPhoneOnly: Bool
    /// True until the director signs off on the defaults; screens mark such roles "proposed".
    public var isProposedDefault: Bool

    /// Whether the app on this device is meant for the role.
    public var runsOnThisDevice: Bool {
        #if os(macOS)
            !iPhoneOnly
        #else
            true
        #endif
    }

    /// What a signed-out visitor sees: nothing.
    public static let signedOut = RoleView(
        capabilities: RoleCapabilities(
            role: .vendorSupport, scope: .none, canRecordData: false, canUseAI: false,
            canEditIEP: false, canExport: false, canDelegateGoals: false, canManageStaff: false,
            canSeeFullIEP: false, canSeeEvaluations: false, minimizedStudentView: true,
            iPhoneOnly: false),
        roleName: "")

    public init(capabilities c: RoleCapabilities, roleName: String? = nil) {
        let listsStudents: Bool
        switch c.scope {
        case .allStudents, .building, .caseload, .servedStudents: listsStudents = true
        case .delegatedGoals, .none: listsStudents = false
        }
        self.roleName = roleName ?? c.role.title
        homeStyle = c.minimizedStudentView && c.scope == .delegatedGoals ? .goalsToday : .numbersAndTiles
        showsToday = c.canRecordData
        showsCaseload = listsStudents
        showsLibraries = c.canEditIEP
        showsGraphs = listsStudents
        caseloadTitle = c.scope == .servedStudents ? "My students" : "Caseload"
        showsFullNames = !c.minimizedStudentView
        canDraft = c.canEditIEP
        canApprove = c.canEditIEP
        canExport = c.canExport
        canUseAI = c.canUseAI
        canDelegate = c.canDelegateGoals
        canManageStaff = c.canManageStaff
        canReviewAccess = c.canManageStaff
        canSeeFullIEP = c.canSeeFullIEP
        canSeeEvaluations = c.canSeeEvaluations
        iPhoneOnly = c.iPhoneOnly
        isProposedDefault = c.isProposedDefault
    }

    /// The proposed defaults for a role.
    public init(role: StaffRole) {
        self.init(capabilities: .proposedDefaults(for: role))
    }
}

extension PrototypeStore {
    /// What the signed-in person's role sees and may do.
    public var roleView: RoleView {
        currentStaff.map { RoleView(role: $0.role) } ?? .signedOut
    }

    /// How a student is named on screen for the signed-in role. Roles that see only first names
    /// get the preferred or first name, plus the grade when two students on their list share it
    /// ("Sam, grade 4"). Everyone else gets the usual display name.
    public func displayName(for student: Student) -> String {
        guard !roleView.showsFullNames else { return student.displayName }
        let name = Self.firstNameOnly(student)
        let shared = visibleStudents.contains {
            $0.id != student.id && Self.firstNameOnly($0).caseInsensitiveCompare(name) == .orderedSame
        }
        return shared ? "\(name), grade \(student.grade)" : name
    }

    /// The goals a role that works from a short list should see today. Until goal-by-goal
    /// delegation exists this is every goal of the students on the person's list.
    public var goalsForToday: [Goal] {
        visibleStudents.flatMap { student in
            goals(for: student).map { displayGoal($0, for: student) }
        }
    }

    /// A copy of the student safe to hand to screens that print `displayName`: roles that see
    /// first names only get the name `displayName(for:)` gives, with the last name and every
    /// identifier removed.
    public func displayStudent(_ student: Student) -> Student {
        guard !roleView.showsFullNames else { return student }
        var shown = student
        shown.preferredName = displayName(for: student)
        shown.lastName = ""
        shown.localStudentID = nil
        shown.stateStudentID = nil
        shown.dateOfBirth = nil
        return shown
    }

    static func firstNameOnly(_ student: Student) -> String {
        if let preferred = student.preferredName, !preferred.isEmpty { return preferred }
        return student.firstName
    }
}
