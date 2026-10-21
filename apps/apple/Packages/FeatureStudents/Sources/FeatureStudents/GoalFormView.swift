import CoreModels
import DesignSystem
import Persistence
import SwiftUI

/// Write a goal by hand, or fix one already on a student: the goal's parts, the baseline and
/// target, and how data will be collected for it.
public struct GoalFormView: View {
    public enum Mode {
        case add(Student)
        case edit(Goal)
    }

    @Environment(PrototypeStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    private let mode: Mode
    private let onSaved: (Goal) -> Void
    /// The way data is collected is fixed once data exists for the goal.
    private let measureLocked: Bool

    @State private var draft: GoalDraft
    @State private var targetValueText: String
    @State private var promptLevelsText: String
    @State private var stepsText: String
    @State private var problem: String?
    @State private var confirmingRemoval = false

    public init(mode: Mode, store: PrototypeStore, onSaved: @escaping (Goal) -> Void = { _ in }) {
        self.mode = mode
        self.onSaved = onSaved
        let start: GoalDraft
        switch mode {
        case .add:
            start = GoalDraft()
            measureLocked = false
        case .edit(let goal):
            start = GoalDraft(goal: goal, plan: store.plan(for: goal))
            measureLocked = !store.dataPoints(for: goal).isEmpty
        }
        _draft = State(initialValue: start)
        _targetValueText = State(initialValue: start.targetValue.map(ValueText.string) ?? "")
        _promptLevelsText = State(initialValue: start.promptHierarchy.joined(separator: "\n"))
        _stepsText = State(initialValue: start.taskSteps.joined(separator: "\n"))
    }

    private var title: String {
        switch mode {
        case .add: "Add goal"
        case .edit: "Edit goal"
        }
    }

    public var body: some View {
        NavigationStack {
            Form {
                Section("Goal") {
                    Picker("Area", selection: $draft.area) {
                        ForEach(GoalArea.allCases, id: \.self) { Text($0.title).tag($0) }
                    }
                    .accessibilityIdentifier(AccessibilityID.goalArea)
                    TextField("Goal statement", text: $draft.statement, axis: .vertical)
                        .lineLimit(3...8)
                        .accessibilityIdentifier(AccessibilityID.goalStatement)
                }
                Section {
                    TextField("Condition (given what)", text: $draft.condition, axis: .vertical)
                        .accessibilityIdentifier(AccessibilityID.goalCondition)
                    TextField("Behavior (does what)", text: $draft.behavior, axis: .vertical)
                        .accessibilityIdentifier(AccessibilityID.goalBehavior)
                    TextField("Criteria (how well)", text: $draft.criteria, axis: .vertical)
                        .accessibilityIdentifier(AccessibilityID.goalCriteria)
                } header: {
                    Text("Parts (optional)")
                }
                Section("Where the student is and where they are going") {
                    TextField("Baseline", text: $draft.baseline, axis: .vertical)
                        .accessibilityIdentifier(AccessibilityID.goalBaseline)
                    TextField("Target", text: $draft.target, axis: .vertical)
                        .accessibilityIdentifier(AccessibilityID.goalTarget)
                }
                Section {
                    Picker("Measure", selection: $draft.type) {
                        ForEach(MeasurementType.allCases, id: \.self) { Text($0.title).tag($0) }
                    }
                    .disabled(measureLocked)
                    .accessibilityIdentifier(AccessibilityID.goalMeasure)
                    TextField("Unit (optional)", text: $draft.unit)
                        .accessibilityIdentifier(AccessibilityID.goalUnit)
                    TextField("Target number (optional)", text: $targetValueText)
                        #if os(iOS)
                            .keyboardType(.decimalPad)
                        #endif
                        .accessibilityIdentifier(AccessibilityID.goalTargetValue)
                    if draft.type == .trials {
                        Stepper(
                            "Trials per session: \(draft.trialsPerSession ?? 10)",
                            value: trialsBinding, in: 1...100
                        )
                        .accessibilityIdentifier(AccessibilityID.goalTrials)
                    }
                    TextField("How often (for example 2x weekly)", text: $draft.frequency)
                        .accessibilityIdentifier(AccessibilityID.goalFrequency)
                    if draft.type == .promptLevel {
                        listField(
                            "Prompt levels, one per line, least help first", text: $promptLevelsText,
                            id: AccessibilityID.goalPromptLevels)
                    }
                    if draft.type == .taskAnalysis {
                        listField(
                            "Steps, one per line", text: $stepsText, id: AccessibilityID.goalSteps)
                    }
                } header: {
                    Text("Data collection")
                } footer: {
                    if measureLocked {
                        Text("The measure cannot change because data has been recorded for this goal.")
                    } else {
                        Text("This build holds practice data only. Use made-up goals.")
                    }
                }
                if case .edit = mode {
                    Section {
                        Button("Delete goal", role: .destructive) { confirmingRemoval = true }
                            .accessibilityIdentifier(AccessibilityID.removeGoal)
                    }
                }
                if let problem {
                    Section {
                        Text(problem).foregroundStyle(Theme.warn)
                            .accessibilityIdentifier(AccessibilityID.goalFormProblem)
                    }
                }
            }
            .formStyle(.grouped)
            .themedList()
            .confirmationDialog(
                "Delete this goal?", isPresented: $confirmingRemoval, titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive, action: remove)
                    .accessibilityIdentifier(AccessibilityID.removeConfirm)
            } message: {
                Text(removalMessage)
            }
            .navigationTitle(title)
            #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .accessibilityIdentifier(AccessibilityID.goalCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save)
                        .accessibilityIdentifier(AccessibilityID.goalSave)
                }
            }
        }
        #if os(macOS)
            .frame(minWidth: 460, minHeight: 560)
        #endif
    }

    private var trialsBinding: Binding<Int> {
        Binding(
            get: { draft.trialsPerSession ?? 10 },
            set: { draft.trialsPerSession = $0 })
    }

    private func listField(_ label: String, text: Binding<String>, id: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.footnote).foregroundStyle(.secondary)
            TextEditor(text: text)
                .frame(minHeight: 96)
                .accessibilityIdentifier(id)
        }
    }

    private var removalMessage: String {
        guard case .edit(let goal) = mode else { return "" }
        let count = store.removalImpact(ofGoal: goal).dataPoints
        return "This also deletes \(count) recorded \(count == 1 ? "entry" : "entries") "
            + "from the practice data."
    }

    private func remove() {
        guard case .edit(let goal) = mode else { return }
        do {
            try store.removeGoal(id: goal.id)
            dismiss()
        } catch {
            problem = "Could not delete. Try again."
        }
    }

    private func save() {
        var entry = draft
        let typed = targetValueText.trimmingCharacters(in: .whitespacesAndNewlines)
        if typed.isEmpty {
            entry.targetValue = nil
        } else if let number = Double(typed.replacingOccurrences(of: ",", with: ".")) {
            entry.targetValue = number
        } else {
            problem = "Enter the target as a number, or leave it blank."
            return
        }
        if entry.type == .trials, entry.trialsPerSession == nil { entry.trialsPerSession = 10 }
        entry.promptHierarchy = promptLevelsText.components(separatedBy: .newlines)
        entry.taskSteps = stepsText.components(separatedBy: .newlines)
        do {
            let goal: Goal
            switch mode {
            case .add(let student):
                goal = try store.addGoal(for: student, draft: entry)
            case .edit(let current):
                goal = try store.updateGoal(id: current.id, draft: entry)
            }
            onSaved(goal)
            dismiss()
        } catch PrototypeStore.StoreError.invalidGoal(let field) {
            switch field {
            case .statementMissing: problem = "Enter the goal statement."
            case .textTooLong: problem = "One of the entries is too long. Shorten it."
            case .targetInvalid: problem = "The target number does not fit this measure."
            case .trialsInvalid: problem = "Choose between 1 and 100 trials."
            case .promptLevelsMissing: problem = "List at least two prompt levels."
            case .stepsMissing: problem = "List at least one step."
            case .measurementLocked:
                problem = "The measure cannot change because data has been recorded."
            }
        } catch {
            problem = "Could not save. Try again."
        }
    }
}

private enum ValueText {
    static func string(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(value)
    }
}
