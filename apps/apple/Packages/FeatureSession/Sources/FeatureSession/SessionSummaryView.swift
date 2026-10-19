import CoreModels
import DesignSystem
import SwiftUI

/// Shown the moment a session ends: per goal, today's value, the last five sessions and a trend
/// arrow (spec 10.3). The data is already saved by the time this appears.
struct SessionSummaryView: View {
    let model: SessionModel
    let hideNames: Bool
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            List {
                if model.deliveryFailed {
                    Section {
                        Label(
                            model.deliveryIsPermanent
                                ? "This session can't be stored. Your data is kept on this device."
                                : "Not stored yet. Your data is kept on this device.",
                            systemImage: "exclamationmark.triangle.fill"
                        )
                        .foregroundStyle(Theme.bad)
                        if model.deliveryIsPermanent {
                            Button("Set aside") { model.setAside() }
                                .frame(minHeight: SessionStyle.minTarget)
                                .accessibilityIdentifier("session.setAside")
                        } else {
                            Button("Try again") { model.retryDelivery() }
                                .frame(minHeight: SessionStyle.minTarget)
                                .accessibilityIdentifier("session.retry")
                        }
                    }
                }
                Section {
                    ForEach(model.summaries) { summary in
                        row(summary)
                    }
                } header: {
                    Text(model.deliveryFailed ? "Session ended" : "Session saved")
                } footer: {
                    if !model.summaries.isEmpty {
                        Text("Recorded on this device. It syncs when you are online.")
                    }
                }
                if !model.rejectedGoalIDs.isEmpty {
                    Section {
                        ForEach(model.rejectedGoalIDs, id: \.self) { id in
                            let item = model.goals.first { $0.id == id }
                            Text(item.map { PrivacyLabel.label(for: $0.student, hidden: hideNames) } ?? "")
                        }
                    } header: {
                        Text("Notes not saved")
                    } footer: {
                        Text("These goals had a note or a reason but no data, so nothing was stored for them.")
                    }
                    .foregroundStyle(Theme.warn)
                }
                if model.summaries.isEmpty {
                    Text("Nothing was recorded.").foregroundStyle(SessionStyle.muted)
                }
            }
            .scrollContentBackground(.hidden)
            Button(action: onClose) {
                Text("Done").font(.title3.bold())
            }
            .buttonStyle(FilledPadStyle(color: Theme.primary, minHeight: SessionStyle.minTarget))
            .padding(16)
            .accessibilityIdentifier("session.done")
        }
    }

    private func row(_ summary: GoalSummary) -> some View {
        let item = model.goals.first { $0.id == summary.goalID }
        let name = item.map { PrivacyLabel.label(for: $0.student, hidden: hideNames) } ?? ""
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(name).font(.headline)
                Spacer()
                Text(summary.todayText).font(.headline.monospacedDigit())
            }
            Text(item.map { PrivacyLabel.text($0.goal.statement, for: $0.student, hidden: hideNames) } ?? "")
                .font(.subheadline)
                .foregroundStyle(SessionStyle.muted)
            HStack(spacing: 12) {
                SessionSparkline(values: summary.recent + (summary.todayValue.map { [$0] } ?? []),
                    target: summary.target)
                    .frame(height: 36)
                Label(summary.trend.words, systemImage: summary.trend.symbol)
                    .font(.caption)
                    .labelStyle(.iconOnly)
                    .accessibilityLabel(summary.trend.words)
            }
            if let reason = summary.noDataReason {
                Text("Reason: \(reason.title)").font(.footnote).foregroundStyle(Theme.warn)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}
