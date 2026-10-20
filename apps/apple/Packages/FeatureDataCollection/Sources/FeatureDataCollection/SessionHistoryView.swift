import CoreModels
import DesignSystem
import Persistence
import SwiftUI

/// Every saved session for a goal, newest first. A mistaken session can be removed after a
/// confirmation; the graph and averages update at once.
public struct SessionHistoryView: View {
    @Environment(PrototypeStore.self) private var store

    private let goal: Goal
    private let plan: MeasurementPlan
    @State private var pending: DataPoint?
    @State private var failure: String?

    public init(goal: Goal, plan: MeasurementPlan) {
        self.goal = goal
        self.plan = plan
    }

    public var body: some View {
        let points = Array(store.dataPoints(for: goal).reversed())
        List {
            if points.isEmpty {
                Text("No sessions saved yet.").foregroundStyle(.secondary)
            } else {
                ForEach(points) { point in
                    SessionRow(point: point, plan: plan)
                        .swipeActions {
                            if store.canRemove(point) {
                                Button("Remove", role: .destructive) { pending = point }
                            }
                        }
                        .contextMenu {
                            if store.canRemove(point) {
                                Button("Remove session", role: .destructive) { pending = point }
                            }
                        }
                }
            }
        }
        .themedList()
        .navigationTitle("History")
        #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
        #endif
        .confirmationDialog(
            "Remove this session? It leaves the graph and the averages.",
            isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } }),
            titleVisibility: .visible, presenting: pending
        ) { point in
            Button("Yes, remove this session", role: .destructive) { remove(point) }
            Button("Keep it", role: .cancel) {}
        }
        .alert(
            "Couldn't remove it", isPresented: Binding(get: { failure != nil }, set: { if !$0 { failure = nil } })
        ) {
            Button("OK") {}
        } message: {
            Text(failure ?? "")
        }
    }

    private func remove(_ point: DataPoint) {
        do {
            try store.removePoint(point.id)
        } catch PrototypeStore.StoreError.saveFailed {
            failure = "Couldn't save. Nothing changed."
        } catch {
            failure = "You can't remove this session."
        }
    }
}
