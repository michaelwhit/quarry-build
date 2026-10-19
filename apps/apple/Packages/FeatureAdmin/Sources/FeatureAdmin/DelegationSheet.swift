import CoreModels
import DesignSystem
import SwiftUI

/// "Give data entry to a para": choose the para, the goals, an end date and a how-to-score note.
/// Shown from a teacher's goal screen. Only this teacher's own goals are offered.
public struct DelegationSheet: View {
    @Bindable var model: StaffAdminModel
    /// Goals to tick when the sheet opens, for example the goal it was opened from.
    private let preselected: Set<UUID>
    @Environment(\.dismiss) private var dismiss
    @State private var paraID: UUID?
    @State private var chosen: Set<UUID>
    @State private var endDate: Date
    @State private var note = ""

    public init(model: StaffAdminModel, preselected: Set<UUID> = []) {
        self.model = model
        self.preselected = preselected
        _chosen = State(initialValue: preselected)
        _endDate = State(initialValue: Self.date(model.schoolYearEnd))
    }

    private static func date(_ day: LocalDate) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar.date(from: DateComponents(year: day.year, month: day.month, day: day.day)) ?? Date()
    }

    private func localDate(_ date: Date) -> LocalDate? {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        guard let y = parts.year, let m = parts.month, let d = parts.day else { return nil }
        return LocalDate(year: y, month: m, day: d)
    }

    private var paras: [StaffPerson] {
        model.snapshot.staff.filter { $0.isActive && StaffRules.delegateRoles.contains($0.role) }
    }

    public var body: some View {
        NavigationStack {
            Form {
                if let message = model.message {
                    Text(message).foregroundStyle(Theme.warn)
                }
                Section("Para") {
                    Picker("Para", selection: $paraID) {
                        Text("Choose").tag(UUID?.none)
                        ForEach(paras) { Text($0.name).tag(Optional($0.id)) }
                    }
                }
                Section("Goals") {
                    ForEach(model.ownGoals()) { goal in
                        Toggle(
                            isOn: Binding(
                                get: { chosen.contains(goal.id) },
                                set: { on in
                                    if on { chosen.insert(goal.id) } else { chosen.remove(goal.id) }
                                })
                        ) {
                            VStack(alignment: .leading) {
                                Text(goal.title)
                                Text(model.student(goal.studentID)?.label ?? "")
                                    .font(.footnote).foregroundStyle(Theme.muted)
                            }
                        }
                    }
                }
                Section {
                    DatePicker(
                        "Ends", selection: $endDate,
                        in: ...Self.date(model.schoolYearEnd), displayedComponents: .date)
                } footer: {
                    Text("Ends no later than the end of the school year.")
                }
                Section(StaffRolesText.howToScore) {
                    TextField("Optional", text: $note, axis: .vertical)
                }
            }
            .themedScreen()
            .navigationTitle(StaffRolesText.delegateTitle)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(StaffRolesText.delegateConfirm) { save() }
                        .disabled(paraID == nil || chosen.isEmpty)
                }
            }
        }
    }

    private func save() {
        guard let paraID, let end = localDate(endDate) else { return }
        if model.delegate(goals: Array(chosen), to: paraID, endDate: end, note: note) { dismiss() }
    }
}
