import DesignSystem
import Persistence
import SwiftUI

/// One student, read only: the whole goals, then what is not built yet. There is no data, no
/// export, print, share, copy-all or AI control on this page, so there is nothing to hide from
/// VoiceOver either.
public struct AtAGlanceView: View {
    private let student: GlanceStudent?

    /// `nil` means the student is no longer shared with this person.
    public init(student: GlanceStudent?) {
        self.student = student
    }

    public var body: some View {
        if let student {
            List {
                Section {
                    LabeledContent("Grade", value: student.grade)
                    if let school = student.school {
                        LabeledContent("School", value: school)
                    }
                    Text(readOnlyLine(student))
                        .font(.footnote).foregroundStyle(Theme.muted)
                }
                Section("Goals") {
                    if student.goals.isEmpty {
                        Text("No goals are shared with you for this student yet.").foregroundStyle(Theme.muted)
                    }
                    ForEach(student.goals) { goal in
                        VStack(alignment: .leading, spacing: Spacing.small) {
                            Text(goal.title).font(.headline)
                            Text(goal.text).fixedSize(horizontal: false, vertical: true)
                            if let line = goal.measuredLine {
                                Text(line).font(.footnote).foregroundStyle(Theme.muted)
                            }
                        }
                        .padding(.vertical, 4)
                        .accessibilityElement(children: .combine)
                    }
                }
                Section("Accommodations and modifications") {
                    planned("Accommodations and modifications are not in this build yet.")
                }
                Section("Services") {
                    planned("Services and minutes are not in this build yet.")
                }
                Section {
                    Text("Don't share this outside school.")
                        .font(.footnote).foregroundStyle(Theme.muted)
                }
            }
            .accessibilityIdentifier("at-a-glance")
            .themedList()
            .navigationTitle(student.name)
        } else {
            ContentUnavailableView(
                "No longer shared", systemImage: "person.crop.circle.badge.xmark",
                description: Text("This student is no longer shared with you."))
        }
    }

    private func readOnlyLine(_ student: GlanceStudent) -> String {
        if let manager = student.caseManager {
            return "Read only. Ask the case manager (\(manager)) if something looks wrong."
        }
        return "Read only. Ask the case manager if something looks wrong."
    }

    private func planned(_ text: String) -> some View {
        Label(text, systemImage: "hourglass").foregroundStyle(Theme.muted)
    }
}
