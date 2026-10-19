import CoreModels
import Foundation

public enum Trend: Sendable, Equatable {
    case up, down, flat, unknown

    public var symbol: String {
        switch self {
        case .up: "arrow.up.right"
        case .down: "arrow.down.right"
        case .flat: "arrow.right"
        case .unknown: "minus"
        }
    }

    public var words: String {
        switch self {
        case .up: "Higher than recent sessions"
        case .down: "Lower than recent sessions"
        case .flat: "About the same as recent sessions"
        case .unknown: "Not enough earlier data to compare"
        }
    }
}

/// What the teacher sees per goal after ending a session: today's value, the last
/// five sessions, and a trend arrow. Decision-rule flags join later.
public struct GoalSummary: Identifiable, Sendable, Equatable {
    public var id: UUID
    public var studentID: UUID
    public var goalID: UUID
    public var todayText: String
    public var todayValue: Double?
    public var recent: [Double]
    public var target: Double?
    public var trend: Trend
    public var noDataReason: NoDataReason?
}

public enum SessionSummary {
    /// How much "about the same" allows, as a fraction of the recent average.
    static let flatBand = 0.05

    public static func make(
        draft: SessionDraft, goals: [SessionGoal], result: CommitResult
    ) -> [GoalSummary] {
        let byGoal = Dictionary(goals.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return draft.entries.compactMap { entry in
            guard let item = byGoal[entry.goalID] else { return nil }
            let past = item.pastSeries
            let recent = Array(past.suffix(5))
            let today = todayPoints(for: entry, in: result, plan: item.plan)
            let todayValue: Double? = today.isEmpty ? nil : today.reduce(0, +) / Double(today.count)
            let text: String
            if let reason = entry.noDataReason, reason.meansNoData, !entry.hasValues {
                text = reason.title
            } else {
                text = describe(entry, plan: item.plan, now: draft.endedAt ?? draft.lastActivityAt)
            }
            return GoalSummary(
                id: entry.id, studentID: entry.studentID, goalID: entry.goalID, todayText: text,
                todayValue: todayValue, recent: recent, target: item.plan.targetValue,
                trend: trend(today: todayValue, past: past), noDataReason: entry.noDataReason)
        }
    }

    /// Today's chart values for the goal, using the same rule as the goal graph.
    static func todayPoints(
        for entry: SessionEntry, in result: CommitResult, plan: MeasurementPlan
    ) -> [Double] {
        result.points
            .filter { $0.goalID == entry.goalID }
            .compactMap { $0.chartValue(for: plan) }
    }

    /// "7 of 9", "4 incidents", "12.5 minutes", "3 verbal".
    static func describe(_ entry: SessionEntry, plan: MeasurementPlan, now: Date) -> String {
        switch entry.type {
        case .trials, .yesNo:
            guard !entry.trials.isEmpty else { return "No trials" }
            return "\(entry.correctCount) of \(entry.trials.count)"
        case .promptLevel:
            guard !entry.trials.isEmpty else { return "No trials" }
            let counts = Dictionary(grouping: entry.trials.compactMap(\.promptLevel), by: { $0 })
            return plan.promptHierarchy.compactMap { level in
                counts[level].map { "\($0.count) \(level)" }
            }.joined(separator: ", ")
        case .frequency:
            let unit = plan.unit ?? "count"
            return "\(entry.tally) \(unit)"
        case .duration:
            let seconds = entry.durationSeconds(at: now)
            let unit = plan.unit?.lowercased() ?? "minutes"
            let value = unit.hasPrefix("sec") ? seconds : seconds / 60
            return ValueFormat.string(value, for: plan)
        default:
            return "-"
        }
    }

    /// Compares today with the mean of up to the last three earlier sessions.
    static func trend(today: Double?, past: [Double]) -> Trend {
        guard let today, !past.isEmpty else { return .unknown }
        let window = past.suffix(3)
        let mean = window.reduce(0, +) / Double(window.count)
        let band = max(abs(mean) * flatBand, 0.0001)
        if today > mean + band { return .up }
        if today < mean - band { return .down }
        return .flat
    }
}
