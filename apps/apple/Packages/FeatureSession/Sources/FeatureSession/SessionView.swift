import CoreModels
import DesignSystem
import SwiftUI

/// The one-hand capture screen: header and readout at the top, controls in the bottom 40%.
/// Large targets, a tick on every tap, undo always visible, no confirmation dialogs (spec 10.2).
public struct SessionView: View {
    let model: SessionModel
    @Binding var hideNames: Bool
    let onClose: () -> Void

    @State private var index = 0
    @State private var promptTag: String?
    @State private var showNoteField = false
    /// The whole goal is open, so a teacher can read it without leaving the capture screen.
    @State private var goalOpen = true
    @State private var goalPanelHeight: CGFloat = 0
    @State private var noteText = ""

    public init(model: SessionModel, hideNames: Binding<Bool>, onClose: @escaping () -> Void) {
        self.model = model
        self._hideNames = hideNames
        self.onClose = onClose
    }

    private var entries: [SessionEntry] { model.draft.entries }

    private var current: SessionEntry? {
        entries.indices.contains(index) ? entries[index] : entries.first
    }

    public var body: some View {
        if model.isEnded {
            SessionSummaryView(model: model, hideNames: hideNames, onClose: onClose)
                .themedScreen()
        } else if let entry = current {
            running(entry).themedScreen()
        } else {
            ContentUnavailableView(
                "Nothing to record", systemImage: "tray",
                description: Text("None of these goals can be recorded on the session screen yet."))
        }
    }

    private func running(_ entry: SessionEntry) -> some View {
        VStack(spacing: 14) {
            header(entry)
            if model.saveFailed {
                Label(
                    "Not saved on this device. Keep this screen open and tell your team.",
                    systemImage: "exclamationmark.triangle.fill"
                )
                .font(.footnote.bold())
                .foregroundStyle(Theme.bad)
                .accessibilityIdentifier("session.saveFailed")
            }
            if entries.count > 1 { chips }
            readout(entry)
                .gesture(swipe)
            Spacer(minLength: 0)
            controls(entry)
            bottomBar(entry)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .task {
            // Ends a forgotten session after the idle limit, keeping everything (spec 10.3).
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                model.endIfIdle()
            }
        }
        .sheet(isPresented: $showNoteField) { noteSheet(entry) }
    }

    // MARK: Top

    private func header(_ entry: SessionEntry) -> some View {
        let item = model.goal(for: entry)
        return HStack(alignment: .top, spacing: 12) {
            // Short goals sit at natural height; a very long goal, the largest text size or
            // landscape scrolls inside a panel capped at 220 points so the controls never get squeezed.
            ScrollView {
                goalPanel(item)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { goalPanelHeight = $0 }
            }
            .scrollBounceBehavior(.basedOnSize)
            .frame(height: min(goalPanelHeight, 220))
            Spacer()
            VStack(alignment: .trailing, spacing: 6) {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    Text(clockText(from: model.draft.startedAt, to: context.date))
                        .font(.headline.monospacedDigit())
                        .accessibilityLabel("Session time \(clockText(from: model.draft.startedAt, to: context.date))")
                }
                HStack(spacing: 8) {
                    Button {
                        hideNames.toggle()
                        // Showing names also opens the whole goal, so there is no going back and forth.
                        if !hideNames { goalOpen = true }
                    } label: {
                        Image(systemName: hideNames ? "eye.slash" : "eye")
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .accessibilityLabel(hideNames ? "Show names" : "Hide names")
                    Button("End session") { model.end() }
                        .buttonStyle(
                            FilledPadStyle(color: Theme.primary, minHeight: 44, fillWidth: false))
                        .accessibilityIdentifier("session.end")
                }
            }
        }
    }

    private func goalPanel(_ item: SessionGoal?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(item.map { PrivacyLabel.label(for: $0.student, hidden: hideNames) } ?? "")
                .font(.headline)
            Text(item.map { PrivacyLabel.text($0.goal.statement, for: $0.student, hidden: hideNames) } ?? "")
                .font(.subheadline)
                .foregroundStyle(SessionStyle.muted)
                .lineLimit(goalOpen ? nil : 2)
                .accessibilityIdentifier("session.goalText")
            Button(goalOpen ? "Hide goal" : "Show whole goal") { goalOpen.toggle() }
                .font(.footnote.bold())
                .frame(minHeight: 44, alignment: .leading)
                .accessibilityIdentifier("session.goalToggle")
            if goalOpen, let item {
                goalDetails(item)
            }
        }
    }

    /// How the goal is measured and where it is headed, next to the full wording.
    private func goalDetails(_ item: SessionGoal) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Measured by \(item.plan.type.title)")
            if let baseline = item.goal.baseline { Text("Baseline: \(PrivacyLabel.text(baseline, for: item.student, hidden: hideNames))") }
            if let target = item.goal.target { Text("Target: \(PrivacyLabel.text(target, for: item.student, hidden: hideNames))") }
        }
        .font(.footnote)
        .foregroundStyle(SessionStyle.muted)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("session.goalDetails")
    }

    private var chips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(entries.enumerated()), id: \.element.id) { position, entry in
                    chip(entry, position: position)
                }
            }
        }
    }

    private func chip(_ entry: SessionEntry, position: Int) -> some View {
        let item = model.goal(for: entry)
        let name = item.map { PrivacyLabel.label(for: $0.student, hidden: hideNames) } ?? "?"
        let selected = position == index
        let hue = item.map { PrivacyLabel.hue(for: $0.student.id) } ?? 0.6
        return Button {
            index = position
            promptTag = nil
        } label: {
            Text(name)
                .font(.subheadline.bold())
                .padding(.horizontal, 14)
                .frame(minHeight: 44)
                .background(
                    Capsule().fill(Color(hue: hue, saturation: 0.5, brightness: 0.85)
                        .opacity(selected ? 1 : 0.35)))
                .foregroundStyle(selected ? Color.black : Color.primary)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func readout(_ entry: SessionEntry) -> some View {
        let item = model.goal(for: entry)
        let past = Array((item?.pastSeries ?? []).suffix(10))
        return VStack(spacing: 10) {
            HStack(spacing: 12) {
                SessionSparkline(values: past, target: item?.plan.targetValue)
                    .frame(height: 44)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(todayText(entry))
                        .font(.title3.bold().monospacedDigit())
                    if let target = item?.plan.targetValue, let plan = item?.plan {
                        Text("aim \(ValueFormat.string(target, for: plan))")
                            .font(.caption)
                            .foregroundStyle(SessionStyle.muted)
                    }
                }
            }
            if entry.type == .trials || entry.type == .yesNo { trialStrip(entry) }
            if let reason = entry.noDataReason {
                Label(reason.title, systemImage: "flag.fill")
                    .font(.footnote.bold())
                    .foregroundStyle(Theme.warn)
            }
        }
        .padding(12)
        .background(SessionStyle.surface, in: RoundedRectangle(cornerRadius: 14))
    }

    private func trialStrip(_ entry: SessionEntry) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Array(entry.trials.enumerated()), id: \.offset) { position, trial in
                    Button {
                        model.flipTrial(at: position, entry: entry.id)
                    } label: {
                        Text(trialSymbol(trial))
                            .font(.title3.bold())
                            .frame(width: 36, height: 44)
                            .foregroundStyle(trial.result == .correct ? SessionStyle.good : SessionStyle.bad)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(
                        "Trial \(position + 1), \(trial.result == .correct ? "correct" : "incorrect"). Tap to change.")
                }
                if entry.trials.isEmpty {
                    Text("Tap a button below to record a trial")
                        .font(.footnote)
                        .foregroundStyle(SessionStyle.muted)
                }
            }
        }
    }

    private func trialSymbol(_ trial: Trial) -> String {
        trial.result == .correct ? "✓" : "✗"
    }

    private var swipe: some Gesture {
        DragGesture(minimumDistance: 40).onEnded { value in
            let step = value.translation.width < 0 ? 1 : -1
            let next = index + step
            if entries.indices.contains(next) {
                index = next
                promptTag = nil
            }
        }
    }

    // MARK: Controls

    @ViewBuilder
    private func controls(_ entry: SessionEntry) -> some View {
        switch entry.type {
        case .trials, .yesNo: trialControls(entry)
        case .promptLevel: promptControls(entry)
        case .frequency: tallyControls(entry)
        case .duration: timerControls(entry)
        default:
            Text("This measure is recorded on the goal screen for now.")
                .foregroundStyle(SessionStyle.muted)
        }
    }

    private func trialControls(_ entry: SessionEntry) -> some View {
        VStack(spacing: 10) {
            if !entry.promptHierarchy.isEmpty { promptTagRow(entry) }
            HStack(spacing: 12) {
                bigButton("Correct", symbol: "checkmark", color: SessionStyle.good) {
                    model.record(.correct, entry: entry.id, promptLevel: promptTag)
                }
                .keyboardShortcut("1", modifiers: [])
                .accessibilityIdentifier("session.correct")
                bigButton("Incorrect", symbol: "xmark", color: SessionStyle.bad) {
                    model.record(.incorrect, entry: entry.id, promptLevel: promptTag)
                }
                .keyboardShortcut("2", modifiers: [])
                .accessibilityIdentifier("session.incorrect")
            }
            if let planned = entry.plannedTrials {
                Text("\(entry.correctCount) correct of \(entry.trials.count) trials, \(planned) planned")
                    .font(.footnote)
                    .foregroundStyle(SessionStyle.muted)
            }
        }
    }

    private func promptTagRow(_ entry: SessionEntry) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(entry.promptHierarchy, id: \.self) { level in
                    Button(level) { promptTag = promptTag == level ? nil : level }
                        .buttonStyle(.bordered)
                        .tint(promptTag == level ? SessionStyle.accent : SessionStyle.muted)
                        .frame(minHeight: SessionStyle.minTarget)
                        .accessibilityAddTraits(promptTag == level ? .isSelected : [])
                }
            }
        }
    }

    private func promptControls(_ entry: SessionEntry) -> some View {
        let columns = [GridItem(.adaptive(minimum: 120), spacing: 10)]
        return LazyVGrid(columns: columns, spacing: 10) {
            ForEach(entry.promptHierarchy, id: \.self) { level in
                let count = entry.trials.filter { $0.promptLevel == level }.count
                Button {
                    model.recordPromptLevel(level, entry: entry.id)
                } label: {
                    VStack(spacing: 2) {
                        Text(level).font(.headline)
                        Text("\(count)").font(.caption.monospacedDigit())
                    }
                }
                .buttonStyle(FilledPadStyle(color: Theme.primary, minHeight: SessionStyle.minTarget + 12))
                .accessibilityLabel("\(level), \(count) so far")
            }
        }
    }

    private func tallyControls(_ entry: SessionEntry) -> some View {
        HStack(spacing: 12) {
            Button {
                model.adjustTally(by: -1, entry: entry.id)
            } label: {
                Image(systemName: "minus")
                    .font(.title.bold())
                    .frame(width: SessionStyle.bigTarget * 0.7, height: SessionStyle.bigTarget)
            }
            .buttonStyle(.bordered)
            .accessibilityLabel("Subtract one")
            bigButton("+1  (\(entry.tally))", symbol: "plus", color: SessionStyle.accent) {
                model.adjustTally(by: 1, entry: entry.id)
            }
            .keyboardShortcut("1", modifiers: [])
            .accessibilityIdentifier("session.plusOne")
        }
    }

    private func timerControls(_ entry: SessionEntry) -> some View {
        let running = entry.runningSince != nil
        return VStack(spacing: 10) {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                Text(clockText(seconds: entry.durationSeconds(at: context.date)))
                    .font(.system(size: 44, weight: .bold, design: .rounded).monospacedDigit())
            }
            bigButton(
                running ? "Stop" : "Start", symbol: running ? "stop.fill" : "play.fill",
                color: running ? SessionStyle.bad : SessionStyle.good
            ) {
                model.toggleTimer(entry: entry.id)
            }
            .keyboardShortcut(.space, modifiers: [])
            .accessibilityIdentifier("session.timer")
        }
    }

    private func bigButton(
        _ title: String, symbol: String, color: Color, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Label(title, systemImage: symbol)
                .font(.title2.bold())
        }
        .buttonStyle(FilledPadStyle(color: color, minHeight: SessionStyle.bigTarget))
    }

    // MARK: Bottom bar

    private func bottomBar(_ entry: SessionEntry) -> some View {
        HStack(spacing: 12) {
            Button {
                model.undo(entry: entry.id)
            } label: {
                Label("Undo", systemImage: "arrow.uturn.backward")
                    .frame(maxWidth: .infinity, minHeight: SessionStyle.minTarget)
            }
            .buttonStyle(.bordered)
            .disabled(!model.canUndo(entry: entry.id))
            .keyboardShortcut("z", modifiers: .command)
            .accessibilityIdentifier("session.undo")

            Menu {
                ForEach(NoDataReason.allCases, id: \.self) { reason in
                    Button(reason.title) { model.setNoData(reason, entry: entry.id) }
                }
                if entry.noDataReason != nil {
                    Button("Clear reason", role: .destructive) {
                        model.setNoData(nil, entry: entry.id)
                    }
                }
                Divider()
                Button("Type a note…") { showNoteField = true }
            } label: {
                Label("Note", systemImage: "note.text")
                    .frame(maxWidth: .infinity, minHeight: SessionStyle.minTarget)
            }
            .buttonStyle(.bordered)
            .accessibilityIdentifier("session.note")

            Button {
                let next = index + 1
                index = entries.indices.contains(next) ? next : 0
                promptTag = nil
            } label: {
                Label("Next", systemImage: "chevron.right")
                    .frame(maxWidth: .infinity, minHeight: SessionStyle.minTarget)
            }
            .buttonStyle(.bordered)
            .disabled(entries.count < 2)
        }
    }

    private func noteSheet(_ entry: SessionEntry) -> some View {
        NavigationStack {
            Form {
                TextField("What happened?", text: $noteText, axis: .vertical)
                    .lineLimit(3...6)
                    .accessibilityIdentifier("session.noteField")
            }
            .navigationTitle("Note")
            #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        noteText = ""
                        showNoteField = false
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        model.addNote(noteText, entry: entry.id)
                        noteText = ""
                        showNoteField = false
                    }
                    .disabled(noteText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }

    // MARK: Text

    private func todayText(_ entry: SessionEntry) -> String {
        let now = model.now
        switch entry.type {
        case .trials, .yesNo: return "\(entry.correctCount) / \(entry.trials.count)"
        case .promptLevel: return "\(entry.trials.count) trials"
        case .frequency: return "\(entry.tally)"
        case .duration: return clockText(seconds: entry.durationSeconds(at: now))
        default: return ""
        }
    }

    private func clockText(from start: Date, to end: Date) -> String {
        clockText(seconds: max(0, end.timeIntervalSince(start)))
    }

    private func clockText(seconds: Double) -> String {
        let total = Int(seconds.rounded(.down))
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}
