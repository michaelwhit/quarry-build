import DesignSystem
import SwiftUI

/// Type or paste an evaluation's scores and summary, see exactly what would be sent, and confirm it.
public struct EvaluationIntakeView: View {
    @Bindable var intake: EvidenceIntake
    let done: () -> Void

    public init(intake: EvidenceIntake, done: @escaping () -> Void) {
        self.intake = intake
        self.done = done
    }

    public var body: some View {
        Form {
            Section("Evaluation") {
                Picker("Type", selection: $intake.kind) {
                    ForEach(EvaluationKind.allCases) { Text($0.label).tag($0) }
                }
                TextField("Test or instrument (for example Acadience ORF)", text: $intake.instrument)
            }
            Section {
                ForEach($intake.rows) { $row in
                    scoreRow($row)
                }
                .onDelete { intake.removeRows(at: $0) }
                Button("Add a score", systemImage: "plus") { intake.addRow() }
            } header: {
                Text("Scores")
            } footer: {
                Text("Type each score as it is printed on the report.")
            }
            Section("Evaluator's summary") {
                TextEditor(text: $intake.summary).frame(minHeight: 100)
            }
            Section("Recommendations") {
                TextEditor(text: $intake.recommendations).frame(minHeight: 100)
            }
            previewSection
            confirmSection
        }
        .themedScreen()
        .navigationTitle("Draft from evaluation")
        .toolbar {
            ToolbarItem(placement: .confirmationAction) { Button("Done", action: done) }
        }
    }

    private func scoreRow(_ row: Binding<ScoreRow>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("Measure (for example Reading Fluency)", text: row.measure)
            Picker("Score type", selection: row.scoreType) {
                ForEach(ScoreType.allCases) { Text($0.label).tag($0) }
            }
            HStack {
                TextField("Score", text: row.value)
                TextField("Percentile", text: row.percentile)
            }
            .textFieldStyle(.roundedBorder)
            ForEach(row.wrappedValue.problems, id: \.self) { problem in
                Text(problem).font(.footnote).foregroundStyle(Theme.warn)
            }
        }
        .padding(.vertical, 4)
    }

    private var previewSection: some View {
        Section {
            if intake.preview.isEmpty {
                Text("Nothing yet. Add scores or text above.").foregroundStyle(Theme.muted)
            }
            ForEach(intake.preview) { item in
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.label).font(.footnote).foregroundStyle(Theme.muted)
                    Text(item.text)
                    if item.isWithheld {
                        Label(
                            "Held back: looks like \(item.withheldReasons.joined(separator: ", ")).",
                            systemImage: "hand.raised"
                        )
                        .font(.footnote).foregroundStyle(Theme.warn)
                    } else if !item.replaced.isEmpty {
                        Text(replacedSummary(item.replaced)).font(.footnote).foregroundStyle(Theme.muted)
                    }
                }
                .padding(.vertical, 2)
                .accessibilityElement(children: .combine)
            }
        } header: {
            Text("What would be sent")
        } footer: {
            Text("Names, dates and numbers that could identify someone are replaced. Held-back lines are never included.")
        }
    }

    private var confirmSection: some View {
        Section {
            ForEach(intake.blockers, id: \.self) { blocker in
                Text(blocker).font(.footnote).foregroundStyle(Theme.warn)
            }
            if intake.isConfirmed {
                Label("Checked. Drafting from this is not connected yet, so nothing has been sent.", systemImage: "checkmark.circle")
                    .foregroundStyle(Theme.good)
            } else {
                Button("I checked this is what may be used") { intake.confirm() }
                    .disabled(!intake.blockers.isEmpty)
            }
            Button("Clear everything", role: .destructive) { intake.clear() }
        } footer: {
            Text("This stays on this screen only. Nothing is saved.")
        }
    }

    private func replacedSummary(_ replaced: [String: Int]) -> String {
        "Replaced: " + replaced.sorted(by: { $0.key < $1.key }).map { "\($0.value) \($0.key)" }.joined(separator: ", ")
    }
}
