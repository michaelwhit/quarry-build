import CoreModels
import DesignSystem
import Persistence
import SwiftUI

/// The signed-in teacher's students. Only students in their scope appear (the store enforces it).
public struct CaseloadView: View {
    @Environment(PrototypeStore.self) private var store
    @Binding private var selection: UUID?

    public init(selection: Binding<UUID?>) {
        _selection = selection
    }

    public var body: some View {
        let students = store.visibleStudents
        Group {
            if students.isEmpty {
                ContentUnavailableView(
                    "No students assigned", systemImage: "person.2",
                    description: Text(
                        "Your account has no students on its caseload. The director assigns them."))
            } else {
                List(students, selection: $selection) { student in
                    StudentRow(student: student).tag(student.id)
                        .accessibilityIdentifier(AccessibilityID.studentRow(student.id))
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.background)
        .accessibilityIdentifier(AccessibilityID.caseloadList)
        .navigationTitle("Caseload")
    }
}

struct StudentRow: View {
    @Environment(PrototypeStore.self) private var store
    let student: Student

    var body: some View {
        let goals = store.goals(for: student)
        let approved = goals.filter { store.approval(for: $0) != nil }.count
        VStack(alignment: .leading, spacing: 4) {
            Text(student.displayName).font(.headline)
            HStack(spacing: 8) {
                Text("Grade \(student.grade)")
                if let school = store.school(for: student) {
                    Text("· \(school.name.replacingOccurrences(of: " (synthetic)", with: ""))")
                }
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
            if !goals.isEmpty {
                StatusChip(
                    "\(approved) of \(goals.count) progress entries approved",
                    systemImage: approved == goals.count ? "checkmark.seal" : "clock",
                    tone: approved == goals.count ? .good : .neutral)
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}
