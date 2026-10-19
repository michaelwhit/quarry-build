import CoreModels
import DesignSystem
import SwiftUI

/// "Invite a provider to this student" (proposed). Shown from a case manager's own student.
public struct InviteProviderSheet: View {
    @Bindable var model: StaffAdminModel
    let studentID: UUID
    @Environment(\.dismiss) private var dismiss
    @State private var providerID: UUID?
    @State private var endDate: Date
    @State private var note = ""

    public init(model: StaffAdminModel, studentID: UUID) {
        self.model = model
        self.studentID = studentID
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let end = model.schoolYearEnd
        _endDate = State(
            initialValue: calendar.date(from: DateComponents(year: end.year, month: end.month, day: end.day))
                ?? Date())
    }

    private var providers: [StaffPerson] {
        model.snapshot.staff.filter { $0.isActive && $0.role == .relatedServiceProvider }
    }

    public var body: some View {
        NavigationStack {
            Form {
                if let message = model.message {
                    Text(message).foregroundStyle(Theme.warn)
                }
                Section("Provider") {
                    Picker("Provider", selection: $providerID) {
                        Text("Choose").tag(UUID?.none)
                        ForEach(providers) { Text("\($0.name), \($0.building)").tag(Optional($0.id)) }
                    }
                }
                Section(StaffRolesText.inviteHelp) {
                    TextField("Optional", text: $note, axis: .vertical)
                }
                Section {
                    DatePicker("Ends", selection: $endDate, displayedComponents: .date)
                } footer: {
                    Text(StaffRolesText.inviteSheetNote)
                }
                Section {
                    Text("Proposed. This may change when the district decides.")
                        .font(.footnote).foregroundStyle(Theme.muted)
                }
            }
            .themedScreen()
            .navigationTitle(StaffRolesText.inviteTitle)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(StaffRolesText.inviteConfirm) { send() }.disabled(providerID == nil)
                }
            }
        }
    }

    private func send() {
        guard let providerID else { return }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let parts = calendar.dateComponents([.year, .month, .day], from: endDate)
        guard let y = parts.year, let m = parts.month, let d = parts.day,
            let end = LocalDate(year: y, month: m, day: d)
        else { return }
        if model.invite(providerID: providerID, studentID: studentID, note: note, endDate: end) { dismiss() }
    }
}
