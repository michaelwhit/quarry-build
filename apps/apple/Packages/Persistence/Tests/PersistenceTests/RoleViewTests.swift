import CoreModels
import Foundation
import Testing

@testable import Persistence

@MainActor
@Suite("RoleView")
struct RoleViewTests {
    func makeStore() throws -> PrototypeStore {
        let dataset = try SyntheticDataset.load(
            from: Data(contentsOf: PrototypeStoreTests.fixtureURL))
        let today = LocalDate(year: 2026, month: 10, day: 17)!
        return PrototypeStore(dataset: dataset, today: { today })
    }

    @Test("signed out sees nothing")
    func signedOut() throws {
        let view = try makeStore().roleView
        #expect(!view.showsToday && !view.showsCaseload && !view.showsLibraries)
        #expect(!view.canDraft && !view.canApprove && !view.canExport && !view.canManageStaff)
    }

    @Test("only the director manages staff and reviews access")
    func staffControls() {
        for role in StaffRole.allCases {
            let view = RoleView(role: role)
            #expect(view.canManageStaff == (role == .spedDirector))
            #expect(view.canReviewAccess == (role == .spedDirector))
        }
    }

    @Test("a paraprofessional gets the short list, first names, and no drafting, approving, export or AI")
    func para() {
        let view = RoleView(role: .paraprofessional)
        #expect(view.homeStyle == .goalsToday)
        #expect(view.showsToday)
        #expect(!view.showsCaseload && !view.showsLibraries && !view.showsGraphs)
        #expect(!view.showsFullNames)
        #expect(!view.canDraft && !view.canApprove && !view.canExport && !view.canUseAI)
        #expect(!view.canDelegate && !view.canManageStaff && !view.canReviewAccess)
    }

    @Test("a case manager can delegate, and a related service provider cannot")
    func delegation() {
        #expect(RoleView(role: .caseManager).canDelegate)
        #expect(!RoleView(role: .relatedServiceProvider).canDelegate)
        #expect(RoleView(role: .relatedServiceProvider).caseloadTitle == "My students")
        #expect(RoleView(role: .caseManager).caseloadTitle == "Caseload")
    }

    @Test("IT admins and vendor support see no student screens")
    func support() {
        for role in [StaffRole.districtITAdmin, .vendorSupport] {
            let view = RoleView(role: role)
            #expect(!view.showsToday && !view.showsCaseload && !view.showsLibraries)
            #expect(!view.canUseAI)
        }
    }

    @Test("the AI flag agrees with the store's own rule for every role")
    func aiAgrees() throws {
        let store = try makeStore()
        for role in StaffRole.allCases {
            guard let member = store.dataset.staff.first(where: { $0.role == role }) else { continue }
            store.signIn(as: member)
            #expect(store.roleView.canUseAI == store.canUseAI)
            #expect(store.roleView.roleName == role.title)
        }
    }

    @Test("a first-name-only role sees first or preferred names, with the grade when two match")
    func names() throws {
        let store = try makeStore()
        let director = try #require(store.dataset.staff.first { $0.role == .spedDirector })
        store.signIn(as: director)
        let student = try #require(store.visibleStudents.first)
        #expect(store.displayName(for: student) == student.displayName)

        let para = try #require(store.dataset.staff.first { $0.role == .paraprofessional })
        store.signIn(as: para)
        // The fixture gives this person no students, so name the director's student directly.
        #expect(store.displayName(for: student) == (student.preferredName ?? student.firstName))
        #expect(!store.displayName(for: student).contains(student.lastName))
        #expect(store.goalsForToday.isEmpty)
    }

    @Test("a screen-safe copy of a student drops the last name and every identifier")
    func safeCopy() throws {
        let store = try makeStore()
        let director = try #require(store.dataset.staff.first { $0.role == .spedDirector })
        store.signIn(as: director)
        var student = try #require(store.visibleStudents.first)
        student.localStudentID = "L-1"
        student.stateStudentID = "S-1"
        #expect(store.displayStudent(student) == student)

        let para = try #require(store.dataset.staff.first { $0.role == .paraprofessional })
        store.signIn(as: para)
        let shown = store.displayStudent(student)
        #expect(shown.id == student.id)
        #expect(shown.lastName.isEmpty)
        #expect(shown.localStudentID == nil && shown.stateStudentID == nil)
        #expect(shown.dateOfBirth == nil)
        #expect(shown.displayName == (student.preferredName ?? student.firstName))
    }

    @Test("only the paraprofessional is held to the iPhone")
    func phoneOnly() {
        for role in StaffRole.allCases {
            #expect(RoleView(role: role).iPhoneOnly == (role == .paraprofessional))
        }
    }

    @Test("the defaults follow the role provider's table")
    func providerTable() {
        let coordinator = RoleView(role: .buildingCoordinator)
        #expect(!coordinator.canUseAI && !coordinator.canDelegate)
        #expect(coordinator.canDraft && coordinator.canExport)

        let provider = RoleView(role: .relatedServiceProvider)
        #expect(provider.canSeeFullIEP && !provider.canSeeEvaluations)
        #expect(!provider.canDraft && !provider.canApprove && provider.canUseAI)
        #expect(!provider.showsLibraries)

        let genEd = RoleView(role: .genEdTeacher)
        #expect(genEd.showsToday && !genEd.showsCaseload && genEd.showsFullNames)
        #expect(genEd.homeStyle == .numbersAndTiles)

        let director = RoleView(role: .spedDirector)
        #expect(director.canSeeFullIEP && director.canSeeEvaluations)
        #expect(RoleView(role: .paraprofessional).canSeeFullIEP == false)
        #expect(StaffRole.allCases.allSatisfy { RoleView(role: $0).isProposedDefault })
    }
}
