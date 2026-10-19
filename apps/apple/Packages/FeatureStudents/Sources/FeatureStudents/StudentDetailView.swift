import CoreModels
import DesignSystem
import Persistence
import SwiftUI

/// One student: their goals with the latest result and progress status. Choosing a goal opens the
/// screen the caller provides, so this package does not need to know about data entry or AI.
public struct StudentDetailView<GoalDestination: View>: View {
    @Environment(PrototypeStore.self) private var store

    @State private var editing = false
    @State private var addingGoal = false
    @State private var editingGoal: Goal?

    private let student: Student
    private let goalDestination: (Goal) -> GoalDestination

    public init(student: Student, @ViewBuilder goalDestination: @escaping (Goal) -> GoalDestination)
    {
        self.student = student
        self.goalDestination = goalDestination
    }

    public var body: some View {
        let goals = store.goals(for: student)
        List {
            Section {
                LabeledContent("Grade", value: student.grade)
                if let school = store.school(for: student) {
                    LabeledContent(
                        "School",
                        value: school.name.replacingOccurrences(of: " (synthetic)", with: ""))
                }
            }
            Section("Goals") {
                if goals.isEmpty {
                    Text("No goals on file.").foregroundStyle(.secondary)
                }
                ForEach(goals) { goal in
                    NavigationLink {
                        goalDestination(goal)
                    } label: {
                        GoalRow(goal: goal)
                    }
                    .accessibilityIdentifier(AccessibilityID.goalRow(goal.id))
                    .contextMenu {
                        if store.canManageGoals {
                            Button("Edit goal", systemImage: "pencil") { editingGoal = goal }
                        }
                    }
                    .swipeActions(edge: .trailing) {
                        if store.canManageGoals {
                            Button("Edit") { editingGoal = goal }
                                .accessibilityIdentifier(AccessibilityID.editGoal)
                        }
                    }
                }
            }
        }
        .accessibilityIdentifier(AccessibilityID.goalList)
        .themedList()
        .navigationTitle(student.displayName)
        .toolbar {
            if store.canManageGoals {
                ToolbarItem {
                    Button("Add goal", systemImage: "plus") { addingGoal = true }
                        .accessibilityIdentifier(AccessibilityID.addGoal)
                }
            }
            if store.canManageStudents {
                ToolbarItem {
                    Button("Edit") { editing = true }
                        .accessibilityIdentifier(AccessibilityID.editStudent)
                }
            }
        }
        .sheet(isPresented: $editing) {
            StudentFormView(mode: .edit(student))
        }
        .sheet(isPresented: $addingGoal) {
            GoalFormView(mode: .add(student), store: store)
        }
        .sheet(item: $editingGoal) { goal in
            GoalFormView(mode: .edit(goal), store: store)
        }
    }
}

struct GoalRow: View {
    @Environment(PrototypeStore.self) private var store
    let goal: Goal

    var body: some View {
        let progress = store.progress(for: goal)
        VStack(alignment: .leading, spacing: 6) {
            Text(goal.area.title).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            Text(goal.statement)
            HStack(spacing: 8) {
                if let latest = progress?.latest, let plan = progress?.plan {
                    Text("Latest \(ValueFormat.string(latest.value, for: plan))")
                        .font(.footnote.weight(.medium))
                }
                if let sufficient = progress?.suggestedSufficient {
                    StatusChip(
                        sufficient ? "On track" : "Behind",
                        systemImage: sufficient ? "arrow.up.right" : "exclamationmark.triangle",
                        tone: sufficient ? .good : .caution)
                }
                if store.approval(for: goal) != nil {
                    StatusChip("Approved", systemImage: "checkmark.seal", tone: .good)
                }
            }
            if let progress, progress.samples.count > 1 {
                Sparkline(values: progress.samples.map(\.value), target: progress.target)
                    .frame(height: 48)
                    .padding(.top, 4)
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}
