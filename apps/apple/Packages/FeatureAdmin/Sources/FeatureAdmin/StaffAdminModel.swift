import CoreModels
import Foundation
import Observation

public enum StaffRules {
    /// The four roles the picker offers.
    public static let selectableRoles: [StaffRole] = [
        .spedDirector, .caseManager, .relatedServiceProvider, .paraprofessional,
    ]

    /// Who can be given data entry on a goal.
    public static let delegateRoles: [StaffRole] = [.paraprofessional, .genEdTeacher]

    /// Proposed defaults; the director can change them per person.
    public static func aiDraftingDefault(for role: StaffRole) -> Bool {
        switch role {
        case .spedDirector, .caseManager, .relatedServiceProvider: true
        default: false
        }
    }

    /// The last day of the school year: June 30. From July on, next June.
    public static func schoolYearEnd(on day: LocalDate) -> LocalDate {
        let year = day.month >= 7 ? day.year + 1 : day.year
        return LocalDate(year: year, month: 6, day: 30)!
    }
}

public struct RoleChangePreview: Equatable, Sendable {
    public var studentsRemoved: Int
    public var delegationsEnded: Int
}

public enum StaffFilter: String, CaseIterable, Identifiable, Sendable {
    case all, teachers, providers, paras, needsAttention
    public var id: String { rawValue }
    public var label: String {
        switch self {
        case .all: "All"
        case .teachers: "SPED teachers"
        case .providers: "SLP / psych"
        case .paras: "Paras"
        case .needsAttention: "Needs attention"
        }
    }
}

/// The state and rules behind the Staff and roles screens. It mirrors the rules the server
/// enforces so the screen can refuse early and explain; the server remains the authority.
@MainActor
@Observable
public final class StaffAdminModel {
    public private(set) var snapshot: StaffSnapshot
    /// The last refusal or failure, in words for the screen. Cleared by the next success.
    public var message: String?

    private let backend: StaffAdminBackend
    public let actorID: UUID
    /// Whether invitations are offered at all. Off if the district wants the director only.
    public let invitationsEnabled: Bool
    private let today: () -> LocalDate
    private let makeID: () -> UUID

    public init(
        backend: StaffAdminBackend, actorID: UUID, invitationsEnabled: Bool = true,
        today: @escaping () -> LocalDate, makeID: @escaping () -> UUID = { UUID() }
    ) {
        self.backend = backend
        self.actorID = actorID
        self.invitationsEnabled = invitationsEnabled
        self.today = today
        self.makeID = makeID
        self.snapshot = backend.snapshot()
    }

    /// Reload from the backend, for example after someone else changed something.
    public func refresh() { snapshot = backend.snapshot() }

    // MARK: Who is acting

    public var actor: StaffPerson? { person(actorID) }
    public var isDirector: Bool { actor?.role == .spedDirector && actor?.isActive == true }
    private var isCaseManager: Bool { actor?.role == .caseManager && actor?.isActive == true }
    /// Giving data entry on a goal: teachers on their own goals.
    public var canDelegate: Bool { isCaseManager }
    public var canInvite: Bool { invitationsEnabled && isCaseManager }
    public var schoolYearEnd: LocalDate { StaffRules.schoolYearEnd(on: today()) }

    // MARK: Reading

    public func person(_ id: UUID) -> StaffPerson? { snapshot.staff.first { $0.id == id } }
    public func student(_ id: UUID) -> StudentRef? { snapshot.students.first { $0.id == id } }

    public func ownCaseload(of id: UUID) -> [StudentRef] {
        (snapshot.caseloads[id] ?? []).compactMap(student)
    }

    /// For a provider, the caseload plus students from accepted invitations that are still active.
    /// A student who has not accepted yet is not in the list.
    public func studentsServed(by id: UUID) -> [StudentRef] {
        var ids = snapshot.caseloads[id] ?? []
        for invitation in snapshot.invitations
        where invitation.providerID == id && invitation.accepted && invitation.isActive(on: today())
            && !ids.contains(invitation.studentID)
        {
            ids.append(invitation.studentID)
        }
        return ids.compactMap(student)
    }

    public func activeDelegations(for delegateID: UUID) -> [Delegation] {
        snapshot.delegations.filter { $0.delegateID == delegateID && $0.isActive(on: today()) }
    }

    public func activeDelegations(givenBy teacherID: UUID) -> [Delegation] {
        snapshot.delegations.filter { $0.teacherID == teacherID && $0.isActive(on: today()) }
    }

    public func activeInvitations(forStudent id: UUID) -> [Invitation] {
        snapshot.invitations.filter { $0.studentID == id && $0.isActive(on: today()) }
    }

    /// Invitations to show on a person's screen, including ones not yet accepted.
    public func invitations(for providerID: UUID) -> [Invitation] {
        snapshot.invitations.filter { $0.providerID == providerID && $0.isActive(on: today()) }
    }

    public func goal(_ id: UUID) -> GoalRef? { snapshot.goals.first { $0.id == id } }

    /// Goals on the acting teacher's own caseload.
    public func ownGoals() -> [GoalRef] {
        let own = Set(snapshot.caseloads[actorID] ?? [])
        return snapshot.goals.filter { own.contains($0.studentID) }
    }

    public func detailLine(for person: StaffPerson) -> String {
        switch person.role {
        case .paraprofessional, .genEdTeacher:
            let active = activeDelegations(for: person.id)
            guard let first = active.map(\.endDate).min() else { return StaffRolesText.goalCount(0) }
            return StaffRolesText.goalCount(active.count) + " · ends " + StaffRolesText.monthYear(first)
        case .caseManager, .relatedServiceProvider:
            return StaffRolesText.studentCount(studentsServed(by: person.id).count)
        default:
            return ""
        }
    }

    public func people(matching filter: StaffFilter, search: String) -> [StaffPerson] {
        let query = search.trimmingCharacters(in: .whitespaces).lowercased()
        return snapshot.staff.filter { person in
            if !query.isEmpty && !person.name.lowercased().contains(query) { return false }
            switch filter {
            case .all: return true
            case .teachers: return person.role == .caseManager
            case .providers: return person.role == .relatedServiceProvider
            case .paras: return person.role == .paraprofessional
            case .needsAttention: return needsAttention(person)
            }
        }
    }

    /// No caseload, or a delegation ending within 14 days.
    public func needsAttention(_ person: StaffPerson) -> Bool {
        guard person.isActive else { return false }
        switch person.role {
        case .caseManager, .relatedServiceProvider:
            return studentsServed(by: person.id).isEmpty
        case .paraprofessional, .genEdTeacher:
            return activeDelegations(for: person.id).contains { endsSoon($0.endDate) }
        default:
            return false
        }
    }

    private func endsSoon(_ end: LocalDate) -> Bool {
        let now = today()
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        guard
            let a = calendar.date(from: DateComponents(year: now.year, month: now.month, day: now.day)),
            let b = calendar.date(from: DateComponents(year: end.year, month: end.month, day: end.day)),
            let days = calendar.dateComponents([.day], from: a, to: b).day
        else { return false }
        return days <= 14
    }

    /// The note an inviter sees when the director removed their invitation.
    public func inviterNotice(_ invitation: Invitation) -> String? {
        invitation.removedByDirector ? StaffRolesText.directorRemovedInvitation : nil
    }

    // MARK: Director: role, caseload, AI

    public func rolePreview(for personID: UUID, to role: StaffRole) -> RoleChangePreview {
        guard let person = person(personID) else { return RoleChangePreview(studentsRemoved: 0, delegationsEnded: 0) }
        var removed = 0
        var ended = 0
        if role == .paraprofessional {
            removed = (snapshot.caseloads[personID] ?? []).count
            ended += activeDelegations(givenBy: personID).count
        }
        if person.role == .paraprofessional && role != .paraprofessional {
            ended += activeDelegations(for: personID).count
        }
        return RoleChangePreview(studentsRemoved: removed, delegationsEnded: ended)
    }

    @discardableResult
    public func changeRole(of personID: UUID, to role: StaffRole) -> Bool {
        run {
            guard self.isDirector else { throw StaffAdminError.notAllowed }
            guard personID != self.actorID else { throw StaffAdminError.notAllowed }
            guard let person = self.person(personID), person.isActive,
                StaffRules.selectableRoles.contains(role), person.role != role
            else { throw StaffAdminError.notAllowed }
            try self.backend.apply(.setRole(person: personID, role: role))
        }
    }

    @discardableResult
    public func setAIDrafting(_ on: Bool, for personID: UUID) -> Bool {
        run {
            guard self.isDirector, self.person(personID)?.isActive == true else {
                throw StaffAdminError.notAllowed
            }
            try self.backend.apply(.setAIDrafting(person: personID, on: on))
        }
    }

    @discardableResult
    public func addStudent(_ studentID: UUID, to personID: UUID) -> Bool {
        run {
            guard self.isDirector, let person = self.person(personID), person.isActive,
                person.role == .caseManager || person.role == .relatedServiceProvider,
                self.student(studentID) != nil
            else { throw StaffAdminError.notAllowed }
            try self.backend.apply(.addStudent(person: personID, student: studentID))
        }
    }

    @discardableResult
    public func removeStudent(_ studentID: UUID, from personID: UUID) -> Bool {
        run {
            guard self.isDirector else { throw StaffAdminError.notAllowed }
            try self.backend.apply(.removeStudent(person: personID, student: studentID))
        }
    }

    // MARK: Delegation

    @discardableResult
    public func delegate(
        goals goalIDs: [UUID], to delegateID: UUID, endDate: LocalDate, note: String
    ) -> Bool {
        run {
            guard self.canDelegate else { throw StaffAdminError.notAllowed }
            guard let delegate = self.person(delegateID), delegate.isActive,
                StaffRules.delegateRoles.contains(delegate.role)
            else { throw StaffAdminError.invalid("Choose a para.") }
            guard !goalIDs.isEmpty else { throw StaffAdminError.invalid("Choose at least one goal.") }
            try self.checkEndDate(endDate)
            let own = Set(self.ownGoals().map(\.id))
            guard goalIDs.allSatisfy(own.contains) else { throw StaffAdminError.notAllowed }
            let existing = self.activeDelegations(for: delegateID).map(\.goalID)
            let fresh = goalIDs.filter { !existing.contains($0) }
            guard !fresh.isEmpty else { throw StaffAdminError.invalid("They already have these goals.") }
            for goalID in fresh {
                try self.backend.apply(
                    .addDelegation(
                        Delegation(
                            id: self.makeID(), goalID: goalID, delegateID: delegateID,
                            teacherID: self.actorID, endDate: endDate,
                            scoringNote: note.trimmingCharacters(in: .whitespacesAndNewlines))))
            }
        }
    }

    /// "Remove now": effective at once; the person's saved data stays.
    @discardableResult
    public func removeDelegation(_ id: UUID) -> Bool {
        run {
            guard var delegation = self.snapshot.delegations.first(where: { $0.id == id }) else {
                throw StaffAdminError.notFound
            }
            guard self.isDirector || delegation.teacherID == self.actorID else {
                throw StaffAdminError.notAllowed
            }
            delegation.removed = true
            try self.backend.apply(.updateDelegation(delegation))
        }
    }

    // MARK: Invitations

    @discardableResult
    public func invite(providerID: UUID, studentID: UUID, note: String, endDate: LocalDate) -> Bool {
        run {
            guard self.canInvite else { throw StaffAdminError.notAllowed }
            guard (self.snapshot.caseloads[self.actorID] ?? []).contains(studentID) else {
                throw StaffAdminError.notAllowed
            }
            guard let provider = self.person(providerID), provider.isActive,
                provider.role == .relatedServiceProvider
            else { throw StaffAdminError.invalid("Choose a provider.") }
            try self.checkEndDate(endDate)
            guard
                !self.snapshot.invitations.contains(where: {
                    $0.providerID == providerID && $0.studentID == studentID && $0.isActive(on: self.today())
                })
            else { throw StaffAdminError.invalid("They are already invited.") }
            try self.backend.apply(
                .addInvitation(
                    Invitation(
                        id: self.makeID(), providerID: providerID, studentID: studentID,
                        invitedByID: self.actorID,
                        note: note.trimmingCharacters(in: .whitespacesAndNewlines), endDate: endDate)))
        }
    }

    /// The invited provider accepts. Until then the student is not in their list.
    @discardableResult
    public func accept(_ invitationID: UUID) -> Bool {
        run {
            guard var invitation = self.snapshot.invitations.first(where: { $0.id == invitationID }) else {
                throw StaffAdminError.notFound
            }
            guard invitation.providerID == self.actorID, invitation.isActive(on: self.today()) else {
                throw StaffAdminError.notAllowed
            }
            invitation.accepted = true
            try self.backend.apply(.updateInvitation(invitation))
        }
    }

    /// The inviter or the director removes it. A director's removal is marked so the inviter is told.
    @discardableResult
    public func removeInvitation(_ id: UUID) -> Bool {
        run {
            guard var invitation = self.snapshot.invitations.first(where: { $0.id == id }) else {
                throw StaffAdminError.notFound
            }
            if invitation.invitedByID == self.actorID {
                invitation.removedByInviter = true
            } else if self.isDirector {
                invitation.removedByDirector = true
            } else {
                throw StaffAdminError.notAllowed
            }
            try self.backend.apply(.updateInvitation(invitation))
        }
    }

    // MARK: Access roster

    /// Active staff with their position and role, for the "who may see student records" list.
    public func accessRoster() -> [AccessRosterRow] {
        guard isDirector else { return [] }
        return snapshot.staff.filter(\.isActive).map {
            AccessRosterRow(name: $0.name, position: $0.building, role: StaffRolesText.roleName($0.role))
        }
    }

    // MARK: Internals

    private func checkEndDate(_ date: LocalDate) throws {
        guard date >= today() else { throw StaffAdminError.invalid("The end date has already passed.") }
        guard date <= schoolYearEnd else {
            throw StaffAdminError.invalid("The end date can't be after the end of the school year.")
        }
    }

    /// Runs a change, refreshes from the backend, and turns a refusal into words for the screen.
    private func run(_ work: () throws -> Void) -> Bool {
        do {
            try work()
            snapshot = backend.snapshot()
            message = nil
            return true
        } catch let error as StaffAdminError {
            snapshot = backend.snapshot()
            message = error.message
            return false
        } catch {
            snapshot = backend.snapshot()
            message = StaffRolesText.saveFailed
            return false
        }
    }
}

public struct AccessRosterRow: Equatable, Sendable {
    public var name: String
    public var position: String
    public var role: String

    /// A CSV the director can save. Every field is quoted, and a field that starts like a
    /// spreadsheet formula gets a leading apostrophe so opening it cannot run anything.
    public static func csv(_ rows: [AccessRosterRow]) -> String {
        func field(_ text: String) -> String {
            var value = text
            if let first = value.first, "=+-@".contains(first) { value = "'" + value }
            return "\"" + value.replacingOccurrences(of: "\"", with: "\"\"") + "\""
        }
        let lines = rows.map { [field($0.name), field($0.position), field($0.role)].joined(separator: ",") }
        return (["Name,Position,Role"] + lines).joined(separator: "\n") + "\n"
    }
}
