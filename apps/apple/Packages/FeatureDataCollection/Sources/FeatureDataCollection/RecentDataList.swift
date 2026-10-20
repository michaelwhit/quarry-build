import CoreModels
import Persistence
import SwiftUI

/// The latest sessions for a goal, newest first, with who collected each.
public struct RecentDataList: View {
    @Environment(PrototypeStore.self) private var store

    private let goal: Goal
    private let plan: MeasurementPlan
    private let limit: Int

    public init(goal: Goal, plan: MeasurementPlan, limit: Int = 8) {
        self.goal = goal
        self.plan = plan
        self.limit = limit
    }

    public var body: some View {
        let points = Array(store.dataPoints(for: goal).reversed().prefix(limit))
        if points.isEmpty {
            Text("No sessions recorded yet.").foregroundStyle(.secondary)
        } else {
            ForEach(points) { point in
                SessionRow(point: point, plan: plan)
            }
        }
    }
}

/// One saved session: the result, the note, when, and who collected it.
struct SessionRow: View {
    @Environment(PrototypeStore.self) private var store
    let point: DataPoint
    let plan: MeasurementPlan

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(point.summary(for: plan)).font(.headline)
                if let note = point.note {
                    Text(note).font(.footnote).foregroundStyle(.secondary)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(point.observedAt.formatted(date: .abbreviated, time: .shortened))
                Text(store.staffName(point.collectorID))
                    .foregroundStyle(.secondary)
            }
            .font(.footnote)
        }
        .accessibilityElement(children: .combine)
    }
}
