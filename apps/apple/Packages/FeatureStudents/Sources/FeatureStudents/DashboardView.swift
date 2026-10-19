import CoreModels
import DesignSystem
import Persistence
import SwiftUI

/// The first screen after sign-in: how the whole caseload is doing, with graphs, before anyone
/// has to pick a student. Numbers come from the same prototype progress rules as the goal graphs.
public struct DashboardView: View {
    @Environment(PrototypeStore.self) private var store
    private let onSelect: (UUID) -> Void

    public init(onSelect: @escaping (UUID) -> Void) {
        self.onSelect = onSelect
    }

    private struct Row: Identifiable {
        let student: Student
        let goal: Goal
        let progress: GoalProgress
        var id: UUID { goal.id }
    }

    private var rows: [Row] {
        store.visibleStudents.flatMap { student in
            store.goals(for: student).compactMap { goal in
                store.progress(for: goal).map { Row(student: student, goal: goal, progress: $0) }
            }
        }
    }

    public var body: some View {
        let all = rows
        let behind = all.filter { $0.progress.suggestedSufficient == false }
        let onTrack = all.filter { $0.progress.suggestedSufficient == true }
        let summary = CaseloadSummary(store: store)
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.large) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(store.dataset.tenant.name.replacingOccurrences(of: " (synthetic)", with: ""))
                        .font(.caption.weight(.bold)).foregroundStyle(Theme.accent)
                    Text("Caseload summary").font(.largeTitle.weight(.heavy))
                        .foregroundStyle(Theme.ink)
                }
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 140), spacing: Spacing.medium)],
                    spacing: Spacing.medium
                ) {
                    KPI(title: "Students", value: "\(summary.students)", tone: .neutral)
                    KPI(title: "On track", value: "\(summary.onTrack)", tone: .good)
                    KPI(title: "Needs a look", value: "\(summary.needsLook)", tone: .caution)
                    KPI(title: "Reports approved", value: "\(summary.approved) of \(summary.goals)", tone: .neutral)
                }
                .modifier(AccessibilityID.container(AccessibilityID.dashboardKPIs))

                Text("Needs a look").font(.title3.weight(.bold)).foregroundStyle(Theme.ink)
                if behind.isEmpty {
                    Text("Every goal with enough data is on track.").foregroundStyle(Theme.muted)
                }
                ForEach(behind) { row in
                    GoalCard(row: row, onSelect: onSelect)
                }

                Text("On track").font(.title3.weight(.bold)).foregroundStyle(Theme.ink)
                ForEach(onTrack) { row in
                    GoalCard(row: row, onSelect: onSelect)
                }
            }
            .padding(Spacing.large)
            .frame(maxWidth: 900, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .themedScreen()
        .modifier(AccessibilityID.container(AccessibilityID.dashboard))
        .navigationTitle(AppInfo.name)
    }

    private struct GoalCard: View {
        @Environment(PrototypeStore.self) private var store
        let row: Row
        let onSelect: (UUID) -> Void

        var body: some View {
            let sufficient = row.progress.suggestedSufficient == true
            Button {
                onSelect(row.student.id)
            } label: {
                HStack(spacing: Spacing.medium) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(row.student.displayName).font(.headline).foregroundStyle(Theme.ink)
                        Text(row.goal.area.title).font(.subheadline).foregroundStyle(Theme.muted)
                        HStack(spacing: 6) {
                            if let latest = row.progress.latest {
                                Text("Latest \(ValueFormat.string(latest.value, for: row.progress.plan))")
                                    .font(.footnote.weight(.semibold)).foregroundStyle(Theme.ink)
                            }
                            if let target = row.progress.target {
                                Text("goal \(ValueFormat.string(target, for: row.progress.plan))")
                                    .font(.footnote).foregroundStyle(Theme.muted)
                            }
                            StatusChip(
                                sufficient ? "On track" : "Behind",
                                systemImage: sufficient ? "arrow.up.right" : "exclamationmark.triangle",
                                tone: sufficient ? .good : .caution)
                        }
                    }
                    Spacer(minLength: 0)
                    Sparkline(
                        values: row.progress.samples.map(\.value), target: row.progress.target,
                        color: sufficient ? Theme.good : Theme.warn
                    )
                    .frame(width: 110, height: 44)
                }
                .card()
                .accessibilityElement(children: .combine)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier(AccessibilityID.dashboardRow(row.goal.id))
        }
    }

    private struct KPI: View {
        let title: String
        let value: String
        let tone: StatusChip.Tone

        var body: some View {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
                Text(value).font(.title.weight(.heavy)).foregroundStyle(color)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .card()
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier(AccessibilityID.kpi(title))
        }

        private var color: Color {
            switch tone {
            case .good: Theme.good
            case .caution: Theme.warn
            case .neutral: Theme.ink
            }
        }
    }
}
