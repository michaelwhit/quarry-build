import CoreModels
import Foundation
import Testing

@testable import FeatureAdmin

@MainActor
final class Clock {
    var day = LocalDate(year: 2026, month: 10, day: 19)!
}

/// Fake people and students for the rules. Names are made up.
@MainActor
struct Fixture {
    let director = StaffPerson(name: "Dana Director", building: "District office", role: .spedDirector)
    let garcia = StaffPerson(name: "Ms. Garcia", building: "North", role: .caseManager)
    let lee = StaffPerson(name: "Mr. Lee", building: "South", role: .caseManager)
    let pat = StaffPerson(name: "Pat Rowe", building: "North", role: .relatedServiceProvider)
    let sam = StaffPerson(name: "Sam Rivera", building: "North", role: .paraprofessional)
    let kim = StaffPerson(name: "Kim Ng", building: "North", role: .paraprofessional, isActive: false)
    let ann = StudentRef(label: "Ann B.", grade: "3", building: "North")
    let ben = StudentRef(label: "Ben C.", grade: "4", building: "North")
    let cal = StudentRef(label: "Cal D.", grade: "2", building: "South")
    let clock = Clock()

    var annGoal: GoalRef { GoalRef(id: Self.annGoalID, studentID: ann.id, title: "Reading fluency") }
    var benGoal: GoalRef { GoalRef(id: Self.benGoalID, studentID: ben.id, title: "Math facts") }
    var calGoal: GoalRef { GoalRef(id: Self.calGoalID, studentID: cal.id, title: "Writing") }
    static let annGoalID = UUID()
    static let benGoalID = UUID()
    static let calGoalID = UUID()

    func snapshot() -> StaffSnapshot {
        StaffSnapshot(
            staff: [director, garcia, lee, pat, sam, kim], students: [ann, ben, cal],
            caseloads: [garcia.id: [ann.id, ben.id], lee.id: [cal.id]],
            goals: [annGoal, benGoal, calGoal])
    }

    func model(
        as actor: StaffPerson, backend: InMemoryStaffAdmin? = nil, invitations: Bool = true
    ) -> (StaffAdminModel, InMemoryStaffAdmin) {
        let store = backend ?? InMemoryStaffAdmin(snapshot())
        let clock = clock
        return (
            StaffAdminModel(
                backend: store, actorID: actor.id, invitationsEnabled: invitations,
                today: { clock.day }),
            store
        )
    }

    func date(_ y: Int, _ m: Int, _ d: Int) -> LocalDate { LocalDate(year: y, month: m, day: d)! }
}

@MainActor
@Suite("Staff and roles rules")
struct StaffAdminTests {
    let f = Fixture()

    @Test("the school year ends June 30; from July it is next June")
    func schoolYear() {
        #expect(StaffRules.schoolYearEnd(on: f.date(2026, 10, 19)) == f.date(2027, 6, 30))
        #expect(StaffRules.schoolYearEnd(on: f.date(2027, 3, 1)) == f.date(2027, 6, 30))
        #expect(StaffRules.schoolYearEnd(on: f.date(2027, 7, 1)) == f.date(2028, 6, 30))
    }

    @Test("only the director changes roles, never their own, never to a role off the list")
    func roleChangeRules() {
        let (asTeacher, _) = f.model(as: f.garcia)
        #expect(!asTeacher.changeRole(of: f.lee.id, to: .spedDirector))
        #expect(asTeacher.message == StaffRolesText.notAllowed)

        let (asDirector, _) = f.model(as: f.director)
        #expect(!asDirector.changeRole(of: f.director.id, to: .caseManager))
        #expect(!asDirector.changeRole(of: f.lee.id, to: .districtITAdmin))
        #expect(!asDirector.changeRole(of: f.kim.id, to: .caseManager))
        #expect(asDirector.changeRole(of: f.lee.id, to: .relatedServiceProvider))
        #expect(asDirector.person(f.lee.id)?.role == .relatedServiceProvider)
    }

    @Test("a teacher who becomes a para loses the caseload and the delegations they gave")
    func teacherToPara() {
        let (teacher, store) = f.model(as: f.garcia)
        #expect(teacher.delegate(goals: [Fixture.annGoalID], to: f.sam.id, endDate: f.date(2027, 5, 1), note: ""))
        let (director, _) = f.model(as: f.director, backend: store)
        let preview = director.rolePreview(for: f.garcia.id, to: .paraprofessional)
        #expect(preview == RoleChangePreview(studentsRemoved: 2, delegationsEnded: 1))
        let text = StaffRolesText.roleChangeConfirm(
            name: "Ms. Garcia", from: .caseManager, to: .paraprofessional, preview: preview)
        #expect(text.contains("from SPED teacher to Para"))
        #expect(text.contains("2 students leave"))
        #expect(director.changeRole(of: f.garcia.id, to: .paraprofessional))
        #expect(director.ownCaseload(of: f.garcia.id).isEmpty)
        #expect(director.activeDelegations(for: f.sam.id).isEmpty)
    }

    @Test("a para who becomes a teacher loses the goals they were given")
    func paraToTeacher() {
        let (teacher, store) = f.model(as: f.garcia)
        teacher.delegate(goals: [Fixture.annGoalID], to: f.sam.id, endDate: f.date(2027, 5, 1), note: "")
        let (director, _) = f.model(as: f.director, backend: store)
        #expect(director.rolePreview(for: f.sam.id, to: .caseManager).delegationsEnded == 1)
        #expect(director.changeRole(of: f.sam.id, to: .caseManager))
        #expect(director.activeDelegations(for: f.sam.id).isEmpty)
    }

    @Test("delegation: own goals only, an active para, an end date within the school year")
    func delegationRules() {
        let (teacher, _) = f.model(as: f.garcia)
        // Not this teacher's student.
        #expect(!teacher.delegate(goals: [Fixture.calGoalID], to: f.sam.id, endDate: f.date(2027, 5, 1), note: ""))
        // Not a para, or not active.
        #expect(!teacher.delegate(goals: [Fixture.annGoalID], to: f.pat.id, endDate: f.date(2027, 5, 1), note: ""))
        #expect(!teacher.delegate(goals: [Fixture.annGoalID], to: f.kim.id, endDate: f.date(2027, 5, 1), note: ""))
        // Past the end of the school year, or already past.
        #expect(!teacher.delegate(goals: [Fixture.annGoalID], to: f.sam.id, endDate: f.date(2027, 7, 1), note: ""))
        #expect(!teacher.delegate(goals: [Fixture.annGoalID], to: f.sam.id, endDate: f.date(2026, 10, 1), note: ""))
        #expect(!teacher.delegate(goals: [], to: f.sam.id, endDate: f.date(2027, 5, 1), note: ""))
        #expect(teacher.activeDelegations(for: f.sam.id).isEmpty)
        // A good one, and the same goal twice is refused.
        #expect(teacher.delegate(goals: [Fixture.annGoalID, Fixture.benGoalID], to: f.sam.id, endDate: f.date(2027, 6, 30), note: " Count taps. "))
        #expect(teacher.activeDelegations(for: f.sam.id).count == 2)
        #expect(teacher.activeDelegations(for: f.sam.id).first?.scoringNote == "Count taps.")
        #expect(!teacher.delegate(goals: [Fixture.annGoalID], to: f.sam.id, endDate: f.date(2027, 6, 30), note: ""))
    }

    @Test("only a teacher gives data entry; the director and others do not")
    func delegationActors() {
        for actor in [f.director, f.pat, f.sam] {
            let (model, _) = f.model(as: actor)
            #expect(!model.canDelegate)
            #expect(!model.delegate(goals: [Fixture.annGoalID], to: f.sam.id, endDate: f.date(2027, 5, 1), note: ""))
        }
    }

    @Test("remove now works for the giver and the director, not another teacher, and the end date expires it")
    func removeDelegation() {
        let (teacher, store) = f.model(as: f.garcia)
        teacher.delegate(goals: [Fixture.annGoalID, Fixture.benGoalID], to: f.sam.id, endDate: f.date(2026, 11, 1), note: "")
        let ids = teacher.activeDelegations(for: f.sam.id).map(\.id)
        let (other, _) = f.model(as: f.lee, backend: store)
        #expect(!other.removeDelegation(ids[0]))
        let (director, _) = f.model(as: f.director, backend: store)
        #expect(director.removeDelegation(ids[0]))
        #expect(teacher.removeDelegation(ids[1]))
        #expect(teacher.activeDelegations(for: f.sam.id).isEmpty)

        teacher.delegate(goals: [Fixture.annGoalID], to: f.sam.id, endDate: f.date(2026, 11, 1), note: "")
        #expect(teacher.activeDelegations(for: f.sam.id).count == 1)
        f.clock.day = f.date(2026, 11, 2)
        #expect(teacher.activeDelegations(for: f.sam.id).isEmpty)
    }

    @Test("caseloads: only the director edits them, and only for teachers and providers")
    func caseloadRules() {
        let (teacher, _) = f.model(as: f.garcia)
        #expect(!teacher.addStudent(f.cal.id, to: f.garcia.id))
        let (director, _) = f.model(as: f.director)
        #expect(director.addStudent(f.cal.id, to: f.garcia.id))
        #expect(director.ownCaseload(of: f.garcia.id).count == 3)
        #expect(!director.addStudent(f.cal.id, to: f.sam.id))
        #expect(director.removeStudent(f.cal.id, from: f.garcia.id))
        #expect(director.ownCaseload(of: f.garcia.id).count == 2)
        #expect(StaffRolesText.removeFromCaseload(student: "Ann B.") == "Remove Ann B. from this caseload? Their data stays.")
    }

    @Test("invitations: own students, providers only, hidden until accepted")
    func invitations() {
        let (teacher, store) = f.model(as: f.garcia)
        #expect(!teacher.invite(providerID: f.pat.id, studentID: f.cal.id, note: "", endDate: f.date(2027, 5, 1)))
        #expect(!teacher.invite(providerID: f.sam.id, studentID: f.ann.id, note: "", endDate: f.date(2027, 5, 1)))
        #expect(!teacher.invite(providerID: f.pat.id, studentID: f.ann.id, note: "", endDate: f.date(2027, 7, 1)))
        #expect(teacher.invite(providerID: f.pat.id, studentID: f.ann.id, note: " Speech goals ", endDate: f.date(2027, 5, 1)))
        #expect(!teacher.invite(providerID: f.pat.id, studentID: f.ann.id, note: "", endDate: f.date(2027, 5, 1)))

        let (provider, _) = f.model(as: f.pat, backend: store)
        #expect(provider.studentsServed(by: f.pat.id).isEmpty)
        let invitation = provider.invitations(for: f.pat.id)[0]
        #expect(!teacher.accept(invitation.id))
        #expect(provider.accept(invitation.id))
        #expect(provider.studentsServed(by: f.pat.id).map(\.id) == [f.ann.id])
        f.clock.day = f.date(2027, 5, 2)
        #expect(provider.studentsServed(by: f.pat.id).isEmpty)
    }

    @Test("a provider, para or director has no invite button, and invitations can be switched off")
    func inviteOffered() {
        for actor in [f.pat, f.sam, f.director] {
            #expect(!f.model(as: actor).0.canInvite)
        }
        #expect(f.model(as: f.garcia).0.canInvite)
        let (off, _) = f.model(as: f.garcia, invitations: false)
        #expect(!off.canInvite)
        #expect(!off.invite(providerID: f.pat.id, studentID: f.ann.id, note: "", endDate: f.date(2027, 5, 1)))
    }

    @Test("the director sees and removes any invitation; the inviter is told, and removing your own is not a notice")
    func invitationRemoval() {
        let (teacher, store) = f.model(as: f.garcia)
        teacher.invite(providerID: f.pat.id, studentID: f.ann.id, note: "", endDate: f.date(2027, 5, 1))
        teacher.invite(providerID: f.pat.id, studentID: f.ben.id, note: "", endDate: f.date(2027, 5, 1))
        let (other, _) = f.model(as: f.lee, backend: store)
        let first = teacher.snapshot.invitations[0]
        let second = teacher.snapshot.invitations[1]
        #expect(!other.removeInvitation(first.id))

        let (director, _) = f.model(as: f.director, backend: store)
        #expect(director.activeInvitations(forStudent: f.ann.id).count == 1)
        #expect(director.removeInvitation(first.id))
        #expect(director.activeInvitations(forStudent: f.ann.id).isEmpty)
        teacher.refresh()
        let removedByDirector = teacher.snapshot.invitations.first { $0.id == first.id }!
        #expect(teacher.inviterNotice(removedByDirector) == "The director removed this invitation.")

        #expect(teacher.removeInvitation(second.id))
        let removedByTeacher = teacher.snapshot.invitations.first { $0.id == second.id }!
        #expect(teacher.inviterNotice(removedByTeacher) == nil)
    }

    @Test("the access list is the active staff, for the director only, and exports safely")
    func roster() {
        #expect(f.model(as: f.garcia).0.accessRoster().isEmpty)
        let rows = f.model(as: f.director).0.accessRoster()
        #expect(rows.count == 5)
        #expect(!rows.contains { $0.name == "Kim Ng" })
        #expect(rows.first { $0.name == "Pat Rowe" }?.role == "SLP / psych")

        let csv = AccessRosterRow.csv([
            AccessRosterRow(name: "=SUM(A1)", position: "North, \"Annex\"", role: "Para")
        ])
        #expect(csv == "Name,Position,Role\n\"'=SUM(A1)\",\"North, \"\"Annex\"\"\",\"Para\"\n")
    }

    @Test("a failed save changes nothing and says so")
    func failedSave() {
        let (director, store) = f.model(as: f.director)
        let before = director.snapshot
        store.failNext = true
        #expect(!director.changeRole(of: f.lee.id, to: .relatedServiceProvider))
        #expect(director.snapshot == before)
        #expect(director.message == "Couldn't save. Nothing changed.")
        #expect(director.changeRole(of: f.lee.id, to: .relatedServiceProvider))
        #expect(director.message == nil)
    }

    @Test("list lines, filters, search and who needs attention")
    func listing() {
        let (teacher, store) = f.model(as: f.garcia)
        teacher.delegate(goals: [Fixture.annGoalID], to: f.sam.id, endDate: f.date(2026, 11, 1), note: "")
        let (director, _) = f.model(as: f.director, backend: store)
        #expect(director.detailLine(for: f.garcia) == "2 students")
        #expect(director.detailLine(for: f.sam) == "1 delegated goal · ends Nov 2026")
        #expect(director.people(matching: .teachers, search: "").count == 2)
        #expect(director.people(matching: .paras, search: "").count == 2)
        #expect(director.people(matching: .all, search: "  garcia ").map(\.id) == [f.garcia.id])
        // Pat has no students; Sam's goal ends within 14 days.
        let attention = Set(director.people(matching: .needsAttention, search: "").map(\.id))
        #expect(attention == [f.pat.id, f.sam.id])
    }

    @Test("proposed defaults for AI drafting follow the role and the director can change one person")
    func aiDrafting() {
        #expect(f.garcia.aiDrafting && f.pat.aiDrafting && f.director.aiDrafting)
        #expect(!f.sam.aiDrafting)
        let (director, _) = f.model(as: f.director)
        #expect(director.setAIDrafting(false, for: f.garcia.id))
        #expect(director.person(f.garcia.id)?.aiDrafting == false)
        #expect(StaffRolesText.aiLine(on: false) == "Drafting: off (proposed)")
        let (teacher, _) = f.model(as: f.garcia)
        #expect(!teacher.setAIDrafting(true, for: f.lee.id))
    }

    @Test("confirm sheet text names the old and new role")
    func confirmText() {
        let text = StaffRolesText.roleChangeConfirm(
            name: "Sam Rivera", from: .paraprofessional, to: .caseManager,
            preview: RoleChangePreview(studentsRemoved: 0, delegationsEnded: 0))
        #expect(
            text
                == "Change Sam Rivera from Para to SPED teacher? They will see full student records for their caseload."
        )
    }

    @Test("a repeated goal is delegated once, and a failed save delegates none of them")
    func delegationBatch() {
        let (teacher, store) = f.model(as: f.garcia)
        store.failNext = true
        #expect(!teacher.delegate(goals: [Fixture.annGoalID, Fixture.benGoalID], to: f.sam.id, endDate: f.date(2027, 5, 1), note: ""))
        #expect(teacher.activeDelegations(for: f.sam.id).isEmpty)
        #expect(teacher.message == "Couldn't save. Nothing changed.")
        #expect(teacher.delegate(goals: [Fixture.annGoalID, Fixture.annGoalID, Fixture.benGoalID], to: f.sam.id, endDate: f.date(2027, 5, 1), note: ""))
        #expect(teacher.activeDelegations(for: f.sam.id).count == 2)
    }

    @Test("an invitation already removed cannot be removed again, so the notice stays true")
    func removeTwice() {
        let (teacher, store) = f.model(as: f.garcia)
        teacher.invite(providerID: f.pat.id, studentID: f.ann.id, note: "", endDate: f.date(2027, 5, 1))
        let id = teacher.snapshot.invitations[0].id
        #expect(teacher.removeInvitation(id))
        let (director, _) = f.model(as: f.director, backend: store)
        #expect(!director.removeInvitation(id))
        teacher.refresh()
        #expect(teacher.inviterNotice(teacher.snapshot.invitations[0]) == nil)
    }
}
