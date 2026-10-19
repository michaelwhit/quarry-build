import CoreModels
import DesignSystem
import Persistence
import SwiftUI

/// Records one session of data for a goal. The controls follow the goal's measurement plan:
/// tap counters for trials, a stepper for counts and minutes, switches for task-analysis steps,
/// a picker for prompt level. Built for one-handed use on iPhone and works the same on Mac.
public struct DataEntryView: View {
    @Environment(PrototypeStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    private let goal: Goal
    private let plan: MeasurementPlan

    @State private var correct = 0
    @State private var incorrect = 0
    @State private var percent = 70.0
    @State private var count = 0
    @State private var minutes = 5.0
    @State private var rubric = 2
    @State private var promptIndex = 0
    @State private var steps: [Bool]
    @State private var note = ""
    @State private var errorMessage: String?
    @State private var stopwatch = Stopwatch()

    public init(goal: Goal, plan: MeasurementPlan) {
        self.goal = goal
        self.plan = plan
        _steps = State(initialValue: Array(repeating: false, count: plan.taskSteps.count))
    }

    public var body: some View {
        NavigationStack {
            Form {
                Section(plan.type.title) { controls }
                Section("Note (optional)") {
                    TextField("What happened this session?", text: $note, axis: .vertical)
                        .lineLimit(1...4)
                        .accessibilityIdentifier(AccessibilityID.dataNote)
                }
                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(Theme.bad) }
                }
            }
            .formStyle(.grouped)
            .themedList()
            .navigationTitle("Record data")
            #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .accessibilityIdentifier(AccessibilityID.dataCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save).disabled(!canSave)
                        .accessibilityIdentifier(AccessibilityID.dataSave)
                }
            }
        }
        #if os(macOS)
            .frame(minWidth: 420, minHeight: 420)
        #endif
    }

    // MARK: Controls

    @ViewBuilder private var controls: some View {
        switch plan.type {
        case .trials, .yesNo:
            trialCounters
        case .percentCorrect:
            VStack(alignment: .leading) {
                Text("\(Int(percent))% correct").font(.title2.bold())
                Slider(value: $percent, in: 0...100, step: 1)
                    .accessibilityLabel("Percent correct")
                    .accessibilityValue("\(Int(percent)) percent")
            }
        case .frequency, .rate:
            Stepper(value: $count, in: 0...500) {
                Text("\(count) \(plan.unit ?? "times")").font(.title2.bold())
            }
        case .duration, .latency:
            VStack(alignment: .leading, spacing: Spacing.medium) {
                timer
                Stepper(value: $minutes, in: 0...240, step: 0.5) {
                    Text("\(minutes.formatted()) \(plan.unit ?? "minutes")").font(.title2.bold())
                }
            }
        case .rubric:
            Picker("Rubric score", selection: $rubric) {
                ForEach(1...4, id: \.self) { Text("\($0)").tag($0) }
            }
            .pickerStyle(.segmented)
        case .promptLevel:
            Picker("Prompt level", selection: $promptIndex) {
                ForEach(Array(plan.promptHierarchy.enumerated()), id: \.offset) { index, level in
                    Text(level.capitalized).tag(index)
                }
            }
            .pickerStyle(.menu)
        case .taskAnalysis:
            ForEach(Array(plan.taskSteps.enumerated()), id: \.offset) { index, step in
                Toggle(step.capitalized, isOn: $steps[index])
            }
        }
    }

    /// Start and stop a stopwatch instead of typing the time. Stopping fills the stepper below, which
    /// the teacher can still adjust.
    private var timer: some View {
        HStack(spacing: Spacing.medium) {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                Text(stopwatch.display(at: context.date))
                    .font(.largeTitle.bold())
                    .monospacedDigit()
                    .accessibilityLabel("Timer \(stopwatch.display(at: context.date))")
            }
            Spacer()
            Button {
                let now = Date()
                if stopwatch.isRunning {
                    stopwatch.stop(at: now)
                    minutes = stopwatch.minutes(at: now)
                } else {
                    stopwatch.start(at: now)
                }
            } label: {
                Label(
                    stopwatch.isRunning ? "Stop" : "Start",
                    systemImage: stopwatch.isRunning ? "stop.fill" : "play.fill"
                )
                .frame(minWidth: 96, minHeight: Spacing.minTapTarget)
            }
            .buttonStyle(.borderedProminent)
            .tint(stopwatch.isRunning ? Theme.bad : Theme.primary)
            .accessibilityIdentifier(AccessibilityID.dataTimerToggle)
        }
    }

    private var trialCounters: some View {
        VStack(spacing: 16) {
            HStack(spacing: 16) {
                counterButton("Correct", isCorrect: true, systemImage: "checkmark", tint: Theme.good) { correct += 1 }
                counterButton("Incorrect", isCorrect: false, systemImage: "xmark", tint: Theme.bad) {
                    incorrect += 1
                }
            }
            HStack {
                Text("\(correct) of \(correct + incorrect)")
                    .font(.largeTitle.bold())
                    .monospacedDigit()
                    .accessibilityLabel("\(correct) correct out of \(correct + incorrect) trials")
                Spacer()
                Button("Undo", systemImage: "arrow.uturn.backward") {
                    if incorrect > 0 || correct > 0 { undoLast() }
                }
                .buttonStyle(.bordered)
                .disabled(correct + incorrect == 0)
                .accessibilityIdentifier(AccessibilityID.dataUndo)
            }
        }
    }

    /// Tracks tap order so Undo removes the most recent tap, not just any trial.
    @State private var tapOrder: [Bool] = []

    private func counterButton(
        _ title: String, isCorrect: Bool, systemImage: String, tint: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            tapOrder.append(isCorrect)
            action()
        } label: {
            Label(title, systemImage: systemImage)
                .font(.title3.bold())
                .frame(maxWidth: .infinity, minHeight: 64)
                .foregroundStyle(Theme.onPrimary)
        }
        .buttonStyle(.borderedProminent)
        .tint(tint)
        .accessibilityIdentifier(isCorrect ? AccessibilityID.dataCorrect : AccessibilityID.dataIncorrect)
    }

    private func undoLast() {
        guard let last = tapOrder.popLast() else { return }
        if last { correct = max(0, correct - 1) } else { incorrect = max(0, incorrect - 1) }
    }

    // MARK: Saving

    private var canSave: Bool {
        switch plan.type {
        case .trials, .yesNo: correct + incorrect > 0
        default: true
        }
    }

    private func save() {
        do {
            switch plan.type {
            case .trials, .yesNo:
                try store.record(
                    goal: goal, correct: correct, total: correct + incorrect, note: note)
            case .percentCorrect:
                try store.record(goal: goal, valueNum: percent, note: note)
            case .frequency, .rate:
                try store.record(goal: goal, valueNum: Double(count), note: note)
            case .duration, .latency:
                try store.record(goal: goal, valueNum: minutes, note: note)
            case .rubric:
                try store.record(goal: goal, valueNum: Double(rubric), note: note)
            case .promptLevel:
                let level = plan.promptHierarchy[promptIndex]
                try store.record(
                    goal: goal, valueNum: Double(promptIndex), promptLevel: level, note: note)
            case .taskAnalysis:
                try store.record(
                    goal: goal, correct: steps.filter { $0 }.count, total: steps.count,
                    stepResults: steps, note: note)
            }
            dismiss()
        } catch {
            errorMessage = "That result does not fit this goal's data sheet. Check the numbers."
        }
    }
}
