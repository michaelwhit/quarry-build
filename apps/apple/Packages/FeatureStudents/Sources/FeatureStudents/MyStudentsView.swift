import DesignSystem
import Persistence
import SwiftUI

/// A read-only teacher's list: only the students given to them. Choosing a row opens At a glance.
/// `resolve` looks the student up again each time the page is shown, so a student who is no longer
/// shared is reported instead of shown from a stale copy.
public struct MyStudentsView: View {
    private let students: [GlanceStudent]
    private let resolve: (UUID) -> GlanceStudent?

    public init(students: [GlanceStudent], resolve: @escaping (UUID) -> GlanceStudent?) {
        self.students = students
        self.resolve = resolve
    }

    public var body: some View {
        NavigationStack {
            Group {
                if students.isEmpty {
                    ContentUnavailableView(
                        "No students yet", systemImage: "person.2",
                        description: Text(
                            "No students are assigned to you yet. Your case manager assigns students here."
                        ))
                } else {
                    List(students) { student in
                        NavigationLink(value: student.id) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(student.name).font(.headline)
                                Text(summary(student)).font(.footnote).foregroundStyle(Theme.muted)
                            }
                            .frame(minHeight: Spacing.minTapTarget, alignment: .leading)
                        }
                        .accessibilityElement(children: .combine)
                    }
                    .themedList()
                }
            }
            .accessibilityIdentifier("my-students-list")
            .navigationTitle("My students")
            .navigationDestination(for: UUID.self) { id in
                AtAGlanceView(student: resolve(id))
            }
        }
        .themedScreen()
    }

    private func summary(_ student: GlanceStudent) -> String {
        let goals = "\(student.goals.count) goal\(student.goals.count == 1 ? "" : "s")"
        return student.grade.isEmpty ? goals : "Grade \(student.grade) · \(goals)"
    }
}
