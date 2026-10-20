import CoreModels
import DesignSystem
import Persistence
import SwiftUI

/// Every session saved for a goal, newest first. A session recorded in the app can be removed if
/// it was a mistake, after a second confirming press; the district's own sample data cannot.
public struct HistoryList: View {
    @Environment(PrototypeStore.self) private var store
    @State private var asking: DataPoint?
    @State private var problem: String?

    private let goal: Goal
    private let plan: MeasurementPlan

    public init(goal: Goal, plan: MeasurementPlan) {
        self.goal = goal
        self.plan = plan
    }

    public var body: some View {
        Group {
            let points = Array(store.dataPoints(for: goal).reversed())
            if points.isEmpty {
                Text("No sessions saved yet.").foregroundStyle(.secondary)
            } else {
                ForEach(points) { point in
                    row(point)
                }
            }
        }
        .confirmationDialog(
            "Remove this session?", isPresented: Binding(
                get: { asking != nil }, set: { if !$0 { asking = nil } }),
            titleVisibility: .visible, presenting: asking
        ) { point in
            Button("Yes, remove this session", role: .destructive) { remove(point) }
                .accessibilityIdentifier(AccessibilityID.historyRemoveConfirm)
        }
        .alert(
            "Session not removed", isPresented: Binding(
                get: { problem != nil }, set: { if !$0 { problem = nil } })
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(problem ?? "")
        }
    }

    private func row(_ point: DataPoint) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(point.summary(for: plan)).font(.headline)
                if let note = point.note {
                    Text(note).font(.footnote).foregroundStyle(.secondary)
                }
                Text(
                    "\(point.observedAt.formatted(date: .abbreviated, time: .shortened)) · \(store.staffName(point.collectorID))"
                )
                .font(.footnote).foregroundStyle(.secondary)
            }
            Spacer()
            if isRemovable(point) {
                Button("Remove", role: .destructive) { asking = point }
                    .buttonStyle(.borderless)
                    .frame(minHeight: Spacing.minTapTarget)
                    .accessibilityIdentifier(AccessibilityID.historyRemove)
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func isRemovable(_ point: DataPoint) -> Bool {
        store.canRecordData && store.addedPoints.contains { $0.id == point.id }
    }

    private func remove(_ point: DataPoint) {
        do {
            try store.removeAddedPoint(id: point.id)
        } catch {
            problem = "Nothing was changed. Try again."
        }
    }
}
