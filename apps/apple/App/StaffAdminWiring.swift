import CoreModels
import DesignSystem
import FeatureAdmin
import Persistence
import SwiftUI

extension PrototypeStore {
    /// The district as the Staff and roles screens read it: students as first name and last
    /// initial (goal text is cleaned the same way), and each person's own caseload from the assignments that are active today.
    func staffSnapshot() -> StaffSnapshot {
        let today = PrototypeStore.systemToday()
        let schools = Dictionary(
            dataset.schools.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
        let students = allStudents.map {
            StudentRef(
                id: $0.id, label: $0.displayName, grade: $0.grade,
                building: schools[$0.schoolID] ?? AppInfo.districtShortName)
        }
        let staff = dataset.staff.map {
            StaffPerson(
                id: $0.id, name: $0.displayName, building: AppInfo.districtShortName,
                role: $0.role, isActive: $0.status == .active)
        }
        var caseloads: [UUID: [UUID]] = [:]
        for assignment in dataset.caseloadAssignments + addedAssignments
        where assignment.relationship == .caseload && assignment.isActive(on: today) {
            caseloads[assignment.staffID, default: []].append(assignment.studentID)
        }
        let studentOfIEP = Dictionary(
            dataset.ieps.map { ($0.id, $0.studentID) }, uniquingKeysWith: { first, _ in first })
        let studentByID = Dictionary(
            allStudents.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let goals = dataset.goals.compactMap { goal -> GoalRef? in
            guard let studentID = studentOfIEP[goal.iepID], let student = studentByID[studentID]
            else { return nil }
            return GoalRef(
                id: goal.id, studentID: studentID,
                title: minimizedText(goal.statement, of: student))
        }
        return StaffSnapshot(staff: staff, students: students, caseloads: caseloads, goals: goals)
    }
}

/// The director's Staff and roles list. In this build the screens work on a copy of the fake
/// district held in memory, so changes made here stay inside the screen.
struct StaffAndRolesScreen: View {
    @Environment(PrototypeStore.self) private var store
    @State private var model: StaffAdminModel?

    var body: some View {
        Group {
            if let model {
                StaffListView(model: model)
            } else if store.roleView.canManageStaff, store.currentStaff != nil {
                ProgressView()
            } else {
                ContentUnavailableView(
                    "Staff and roles is not available", systemImage: "person.2.slash",
                    description: Text("Sign in as the director to manage staff."))
            }
        }
        .task {
            guard model == nil, store.roleView.canManageStaff, let staff = store.currentStaff
            else { return }
            model = StaffAdminModel(
                backend: InMemoryStaffAdmin(store.staffSnapshot()), actorID: staff.id,
                today: { PrototypeStore.systemToday() })
        }
    }
}
