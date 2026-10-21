import CoreModels
import Foundation

/// Every sentence on the Staff and roles screens, in one place so wording is checked in one file.
/// Plain words: no "scope", "tier" or "RBAC". Confirm sheets say who gains or loses what.
public enum StaffRolesText {
    public static let title = "Staff and roles"
    public static let searchPrompt = "Search staff"
    public static let roleHelp =
        "Role is set by you. Change it here; it takes effect the next time they open the app."
    public static let emptyStaff = "Staff appear here after they sign in for the first time."
    public static let signedOut = "Signed out"
    public static let proposedSuffix = " (proposed)"
    public static let saveFailed = "Couldn't save. Nothing changed."
    public static let notAllowed = "You can't do that."
    public static let tryAgain = "Try again"
    public static let directorRemovedInvitation = "The director removed this invitation."
    public static let rosterTitle = "Who can see student records"
    public static let rosterExport = "Export who can see student records"
    public static let rosterNote = "Keep this list current. It shows who may see student records."
    public static let accessReviewPlanned = "Planned"
    public static let delegateTitle = "Give data entry to a para"
    public static let delegateConfirm = "Give data entry"
    public static let howToScore = "How to score this goal"
    public static let inviteTitle = "Invite a provider to this student"
    public static let inviteConfirm = "Send invitation"
    public static let inviteSheetNote =
        "They will see this student's record for their service. You and the director can remove this any time."
    public static let inviteHelp = "What they will help with"

    public static func roleName(_ role: StaffRole) -> String {
        switch role {
        case .spedDirector: "SPED director"
        case .caseManager: "Case manager"
        case .relatedServiceProvider: "SLP / psych"
        case .paraprofessional: "Para"
        default: role.title
        }
    }

    public static func roleLine(_ role: StaffRole) -> String {
        switch role {
        case .spedDirector: "Sees every student and staff member, and sets roles."
        case .caseManager: "Works with the full records of their own caseload and can give data entry to a para."
        case .relatedServiceProvider: "Sees what they need for their service, for the students they serve."
        case .paraprofessional: "Records data on the goals a teacher gives them. Nothing else."
        default: role.title
        }
    }

    public static func roleChangeConfirm(name: String, from old: StaffRole, to new: StaffRole, preview: RoleChangePreview) -> String {
        var text = "Change \(name) from \(roleName(old)) to \(roleName(new))? " + consequence(of: new)
        if preview.studentsRemoved > 0 {
            text += " \(preview.studentsRemoved) \(preview.studentsRemoved == 1 ? "student leaves" : "students leave") their caseload; a teacher must give them goals."
        }
        if preview.delegationsEnded > 0 {
            text += " \(preview.delegationsEnded) delegated \(preview.delegationsEnded == 1 ? "goal ends" : "goals end")."
        }
        return text
    }

    private static func consequence(of role: StaffRole) -> String {
        switch role {
        case .spedDirector: "They will see all students and staff."
        case .caseManager: "They will see full student records for their caseload."
        case .relatedServiceProvider: "They will see only what they need for their service."
        case .paraprofessional: "They will see only the goals a teacher gives them."
        default: ""
        }
    }

    public static func removeFromCaseload(student: String) -> String {
        "Remove \(student) from this caseload? Their data stays."
    }

    public static func removeDelegation(delegate: String) -> String {
        "Take this goal off \(delegate)'s list now? \(delegate) keeps no records on their phone and saved data stays."
    }

    public static func delegatedLine(delegate: String, end: LocalDate) -> String {
        "Delegated to \(delegate), ends \(monthYear(end))"
    }

    public static func invitedLine(provider: String, invited: Bool) -> String {
        invited ? "\(provider), invited" : provider
    }

    public static func invitedBy(_ name: String) -> String { "Invited by \(name)" }

    public static func studentCount(_ n: Int) -> String { "\(n) \(n == 1 ? "student" : "students")" }

    public static func goalCount(_ n: Int) -> String { "\(n) delegated \(n == 1 ? "goal" : "goals")" }

    public static func aiLine(on: Bool) -> String {
        "Drafting: \(on ? "on" : "off")" + proposedSuffix
    }

    private static let months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]

    public static func monthYear(_ date: LocalDate) -> String {
        "\(months[date.month - 1]) \(date.year)"
    }
}
