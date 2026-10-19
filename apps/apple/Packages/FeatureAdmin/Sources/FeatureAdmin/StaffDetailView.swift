import CoreModels
import DesignSystem
import SwiftUI

/// One person: role, students or delegated goals, and the AI drafting switch. Director only.
public struct StaffDetailView: View {
    @Bindable var model: StaffAdminModel
    let personID: UUID
    @State private var pendingRole: StaffRole?
    @State private var removingStudent: StudentRef?
    @State private var removingDelegation: Delegation?
    @State private var showingPicker = false

    public init(model: StaffAdminModel, personID: UUID) {
        self.model = model
        self.personID = personID
    }

    public var body: some View {
        Group {
            if let person = model.person(personID) {
                content(person)
            } else {
                ContentUnavailableView(StaffRolesText.saveFailed, systemImage: "exclamationmark.triangle")
            }
        }
        .themedScreen()
    }

    @ViewBuilder
    private func content(_ person: StaffPerson) -> some View {
        List {
            if let message = model.message {
                Text(message).foregroundStyle(Theme.warn)
            }
            Section {
                Picker("Role", selection: roleBinding(person)) {
                    ForEach(StaffRules.selectableRoles, id: \.self) { role in
                        VStack(alignment: .leading) {
                            Text(StaffRolesText.roleName(role))
                            Text(StaffRolesText.roleLine(role)).font(.footnote)
                        }
                        .tag(role)
                    }
                }
                .pickerStyle(.inline)
                .disabled(!model.isDirector || person.id == model.actorID)
            } header: {
                Text("Role")
            } footer: {
                Text(StaffRolesText.roleHelp)
            }
            switch person.role {
            case .caseManager, .relatedServiceProvider: studentsSection(person)
            case .paraprofessional: delegationsSection(person)
            default: EmptyView()
            }
            Section {
                Toggle(
                    "Allow AI drafting" + StaffRolesText.proposedSuffix,
                    isOn: Binding(
                        get: { person.aiDrafting },
                        set: { model.setAIDrafting($0, for: person.id) }))
            } footer: {
                Text(StaffRolesText.aiLine(on: person.aiDrafting))
            }
        }
        .navigationTitle(person.name)
        .confirmationDialog(
            "Change role",
            isPresented: Binding(get: { pendingRole != nil }, set: { if !$0 { pendingRole = nil } }),
            titleVisibility: .visible
        ) {
            Button("Change role") {
                if let role = pendingRole { model.changeRole(of: person.id, to: role) }
                pendingRole = nil
            }
            Button("Cancel", role: .cancel) { pendingRole = nil }
        } message: {
            if let role = pendingRole {
                Text(
                    StaffRolesText.roleChangeConfirm(
                        name: person.name, from: person.role, to: role,
                        preview: model.rolePreview(for: person.id, to: role)))
            }
        }
        .sheet(isPresented: $showingPicker) {
            StudentPickerSheet(model: model, personID: person.id)
        }
    }

    private func roleBinding(_ person: StaffPerson) -> Binding<StaffRole> {
        Binding(
            get: { person.role },
            set: { new in if new != person.role { pendingRole = new } })
    }

    private func studentsSection(_ person: StaffPerson) -> some View {
        Section {
            ForEach(model.ownCaseload(of: person.id)) { student in
                studentRow(student, person: person)
            }
            ForEach(model.invitations(for: person.id)) { invitation in
                if let student = model.student(invitation.studentID) {
                    VStack(alignment: .leading) {
                        Text(StaffRolesText.invitedLine(provider: student.label, invited: !invitation.accepted))
                        Text(StaffRolesText.invitedBy(model.person(invitation.invitedByID)?.name ?? ""))
                            .font(.footnote).foregroundStyle(Theme.muted)
                        Button("Remove", role: .destructive) { model.removeInvitation(invitation.id) }
                    }
                    .accessibilityElement(children: .contain)
                }
            }
            Button("Add student", systemImage: "plus") { showingPicker = true }
        } header: {
            Text(person.role == .caseManager ? "Caseload" : "Students they serve")
        }
    }

    private func studentRow(_ student: StudentRef, person: StaffPerson) -> some View {
        HStack {
            VStack(alignment: .leading) {
                Text(student.label)
                Text("Grade \(student.grade) · \(student.building)").font(.footnote).foregroundStyle(Theme.muted)
            }
            Spacer()
            Button("Remove", role: .destructive) { removingStudent = student }
        }
        .confirmationDialog(
            StaffRolesText.removeFromCaseload(student: student.label),
            isPresented: Binding(
                get: { removingStudent?.id == student.id }, set: { if !$0 { removingStudent = nil } }),
            titleVisibility: .visible
        ) {
            Button("Remove", role: .destructive) {
                model.removeStudent(student.id, from: person.id)
                removingStudent = nil
            }
            Button("Cancel", role: .cancel) { removingStudent = nil }
        }
    }

    private func delegationsSection(_ person: StaffPerson) -> some View {
        Section("Delegated goals") {
            let items = model.activeDelegations(for: person.id)
            if items.isEmpty { Text("No goals yet.").foregroundStyle(Theme.muted) }
            ForEach(items) { delegation in
                VStack(alignment: .leading) {
                    Text(model.goal(delegation.goalID)?.title ?? "")
                    Text(
                        "Given by \(model.person(delegation.teacherID)?.name ?? "") · ends "
                            + StaffRolesText.monthYear(delegation.endDate)
                    )
                    .font(.footnote).foregroundStyle(Theme.muted)
                    Button("Remove now", role: .destructive) { removingDelegation = delegation }
                }
                .confirmationDialog(
                    StaffRolesText.removeDelegation(delegate: person.name),
                    isPresented: Binding(
                        get: { removingDelegation?.id == delegation.id },
                        set: { if !$0 { removingDelegation = nil } }),
                    titleVisibility: .visible
                ) {
                    Button("Remove now", role: .destructive) {
                        model.removeDelegation(delegation.id)
                        removingDelegation = nil
                    }
                    Button("Cancel", role: .cancel) { removingDelegation = nil }
                }
            }
        }
    }
}

/// Pick students to add to a caseload. Each tap adds one; a checkmark shows who is on it.
struct StudentPickerSheet: View {
    @Bindable var model: StaffAdminModel
    let personID: UUID
    @Environment(\.dismiss) private var dismiss
    @State private var search = ""

    var body: some View {
        NavigationStack {
            let current = Set(model.ownCaseload(of: personID).map(\.id))
            List(
                model.snapshot.students.filter {
                    search.isEmpty || $0.label.lowercased().contains(search.lowercased())
                }
            ) { student in
                Button {
                    if !current.contains(student.id) { model.addStudent(student.id, to: personID) }
                } label: {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(student.label)
                            Text("Grade \(student.grade) · \(student.building)").font(.footnote)
                                .foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        if current.contains(student.id) { Image(systemName: "checkmark") }
                    }
                }
            }
            .searchable(text: $search, prompt: "Search students")
            .themedScreen()
            .navigationTitle("Add student")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
