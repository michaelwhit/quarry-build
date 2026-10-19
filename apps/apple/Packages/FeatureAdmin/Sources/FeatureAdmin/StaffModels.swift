import CoreModels
import Foundation

/// A staff member as the Staff and roles screens show them. Fake data only in this build.
public struct StaffPerson: Identifiable, Equatable, Sendable {
    public var id: UUID
    public var name: String
    public var building: String
    public var role: StaffRole
    /// False for someone signed out or removed by the district account. Shown muted, never edited.
    public var isActive: Bool
    /// Whether AI drafting is on for this person. The role sets the default.
    public var aiDrafting: Bool

    public init(
        id: UUID = UUID(), name: String, building: String, role: StaffRole, isActive: Bool = true,
        aiDrafting: Bool? = nil
    ) {
        self.id = id
        self.name = name
        self.building = building
        self.role = role
        self.isActive = isActive
        self.aiDrafting = aiDrafting ?? StaffRules.aiDraftingDefault(for: role)
    }
}

/// A student as this screen shows them: first name and last initial, never a last name or an id.
public struct StudentRef: Identifiable, Equatable, Sendable {
    public var id: UUID
    public var label: String
    public var grade: String
    public var building: String

    public init(id: UUID = UUID(), label: String, grade: String, building: String) {
        self.id = id
        self.label = label
        self.grade = grade
        self.building = building
    }
}

public struct GoalRef: Identifiable, Equatable, Sendable {
    public var id: UUID
    public var studentID: UUID
    public var title: String

    public init(id: UUID = UUID(), studentID: UUID, title: String) {
        self.id = id
        self.studentID = studentID
        self.title = title
    }
}

/// Data entry on one goal given to a paraprofessional or general-education teacher.
public struct Delegation: Identifiable, Equatable, Sendable {
    public var id: UUID
    public var goalID: UUID
    public var delegateID: UUID
    public var teacherID: UUID
    public var endDate: LocalDate
    /// "How to score this goal", shown to the person who got it.
    public var scoringNote: String
    public var removed: Bool

    public init(
        id: UUID = UUID(), goalID: UUID, delegateID: UUID, teacherID: UUID, endDate: LocalDate,
        scoringNote: String = "", removed: Bool = false
    ) {
        self.id = id
        self.goalID = goalID
        self.delegateID = delegateID
        self.teacherID = teacherID
        self.endDate = endDate
        self.scoringNote = scoringNote
        self.removed = removed
    }

    public func isActive(on day: LocalDate) -> Bool { !removed && day <= endDate }
}

/// A case manager's invitation of a related-service provider to one of their students.
public struct Invitation: Identifiable, Equatable, Sendable {
    public var id: UUID
    public var providerID: UUID
    public var studentID: UUID
    public var invitedByID: UUID
    public var note: String
    public var endDate: LocalDate
    public var accepted: Bool
    public var removedByDirector: Bool
    public var removedByInviter: Bool

    public init(
        id: UUID = UUID(), providerID: UUID, studentID: UUID, invitedByID: UUID, note: String = "",
        endDate: LocalDate, accepted: Bool = false, removedByDirector: Bool = false,
        removedByInviter: Bool = false
    ) {
        self.id = id
        self.providerID = providerID
        self.studentID = studentID
        self.invitedByID = invitedByID
        self.note = note
        self.endDate = endDate
        self.accepted = accepted
        self.removedByDirector = removedByDirector
        self.removedByInviter = removedByInviter
    }

    public var isRemoved: Bool { removedByDirector || removedByInviter }

    public func isActive(on day: LocalDate) -> Bool { !isRemoved && day <= endDate }
}

/// Everything the screens read, in one value.
public struct StaffSnapshot: Equatable, Sendable {
    public var staff: [StaffPerson]
    public var students: [StudentRef]
    /// Staff id to the students on their own caseload.
    public var caseloads: [UUID: [UUID]]
    public var goals: [GoalRef]
    public var delegations: [Delegation]
    public var invitations: [Invitation]

    public init(
        staff: [StaffPerson] = [], students: [StudentRef] = [], caseloads: [UUID: [UUID]] = [:],
        goals: [GoalRef] = [], delegations: [Delegation] = [], invitations: [Invitation] = []
    ) {
        self.staff = staff
        self.students = students
        self.caseloads = caseloads
        self.goals = goals
        self.delegations = delegations
        self.invitations = invitations
    }
}

public enum StaffChange: Equatable, Sendable {
    case setRole(person: UUID, role: StaffRole)
    case setAIDrafting(person: UUID, on: Bool)
    case addStudent(person: UUID, student: UUID)
    case removeStudent(person: UUID, student: UUID)
    case addDelegation(Delegation)
    case updateDelegation(Delegation)
    case addInvitation(Invitation)
    case updateInvitation(Invitation)
}

public enum StaffAdminError: Error, Equatable, Sendable {
    case notAllowed
    case notFound
    case invalid(String)
    case saveFailed

    /// Words for the screen. A failed save always says nothing changed.
    public var message: String {
        switch self {
        case .notAllowed: StaffRolesText.notAllowed
        case .notFound, .saveFailed: StaffRolesText.saveFailed
        case .invalid(let reason): reason
        }
    }
}

/// Where the data lives. The prototype keeps it in memory; the real source is the server, which
/// decides access. The screens depend on this protocol only.
@MainActor
public protocol StaffAdminBackend: AnyObject {
    func snapshot() -> StaffSnapshot
    func apply(_ change: StaffChange) throws
}

/// Fake-data backend for demo builds and tests. A failed change leaves everything as it was.
@MainActor
public final class InMemoryStaffAdmin: StaffAdminBackend {
    private var data: StaffSnapshot
    /// Tests set this to see the "Nothing changed" path.
    public var failNext = false

    public init(_ data: StaffSnapshot) {
        self.data = data
    }

    public func snapshot() -> StaffSnapshot { data }

    public func apply(_ change: StaffChange) throws {
        if failNext {
            failNext = false
            throw StaffAdminError.saveFailed
        }
        var next = data
        switch change {
        case .setRole(let id, let role):
            guard let index = next.staff.firstIndex(where: { $0.id == id }) else {
                throw StaffAdminError.notFound
            }
            let old = next.staff[index].role
            next.staff[index].role = role
            next.staff[index].aiDrafting = StaffRules.aiDraftingDefault(for: role)
            if role == .paraprofessional {
                // A para has no caseload; goals they gave out end with the move.
                next.caseloads[id] = []
                for i in next.delegations.indices where next.delegations[i].teacherID == id {
                    next.delegations[i].removed = true
                }
            }
            if old == .paraprofessional && role != old {
                for i in next.delegations.indices where next.delegations[i].delegateID == id {
                    next.delegations[i].removed = true
                }
            }
        case .setAIDrafting(let id, let on):
            guard let index = next.staff.firstIndex(where: { $0.id == id }) else {
                throw StaffAdminError.notFound
            }
            next.staff[index].aiDrafting = on
        case .addStudent(let person, let student):
            guard next.staff.contains(where: { $0.id == person }),
                next.students.contains(where: { $0.id == student })
            else { throw StaffAdminError.notFound }
            var list = next.caseloads[person] ?? []
            if !list.contains(student) { list.append(student) }
            next.caseloads[person] = list
        case .removeStudent(let person, let student):
            next.caseloads[person] = (next.caseloads[person] ?? []).filter { $0 != student }
        case .addDelegation(let delegation):
            next.delegations.append(delegation)
        case .updateDelegation(let delegation):
            guard let index = next.delegations.firstIndex(where: { $0.id == delegation.id }) else {
                throw StaffAdminError.notFound
            }
            next.delegations[index] = delegation
        case .addInvitation(let invitation):
            next.invitations.append(invitation)
        case .updateInvitation(let invitation):
            guard let index = next.invitations.firstIndex(where: { $0.id == invitation.id }) else {
                throw StaffAdminError.notFound
            }
            next.invitations[index] = invitation
        }
        data = next
    }
}
