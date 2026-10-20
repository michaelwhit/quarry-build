import CoreModels
import Foundation

/// One card on the Today tab: a student and the goals to take data on.
public struct TodayCard: Identifiable, Hashable, Sendable {
    public var id: UUID { student.id }
    public var student: Student
    public var goals: [SessionGoal]
    /// Days since the last data point on any of these goals; nil when there is none.
    public var daysSinceData: Int?

    public var runnableGoals: [SessionGoal] { goals.filter(\.isSupported) }
    public var skippedCount: Int { goals.count - runnableGoals.count }

    /// The goals that still need a session on their schedule, and how many are caught up.
    public var dueGoals: [SessionGoal]
    /// The moment the card was planned for, so every schedule line on it agrees.
    public var now: Date
    public var caughtUpCount: Int { goals.count - dueGoals.count }
    public var hasDue: Bool { !dueGoals.isEmpty }
}

/// Builds the Today tab from a caseload. Services and a bell schedule do not exist in the data
/// yet, so cards are per student, ordered by who has gone longest without data; pinned goals sit
/// in their own row. Real session times arrive with the schedule model.
public enum TodayPlanner {
    public static func cards(goals: [SessionGoal], now: Date, calendar: Calendar = .current)
        -> [TodayCard]
    {
        let grouped = Dictionary(grouping: goals, by: { $0.student.id })
        let cards = grouped.values.compactMap { items -> TodayCard? in
            guard let student = items.first?.student else { return nil }
            let ordered = items.sorted { $0.goal.sequence < $1.goal.sequence }
            let last = ordered.compactMap(\.lastDataAt).max()
            let days = last.map { daysBetween($0, now, calendar) }
            // A goal the session screen cannot run is not a reason to list the student as to do.
            let due = ordered.filter {
                $0.isSupported && $0.scheduleDue(now: now, calendar: calendar).isDue
            }
            return TodayCard(student: student, goals: ordered, daysSinceData: days, dueGoals: due,
                now: now)
        }
        // Longest without data first (never recorded counts as longest), then by name.
        return cards.sorted { a, b in
            switch (a.daysSinceData, b.daysSinceData) {
            case (nil, nil): return a.student.lastName < b.student.lastName
            case (nil, _): return true
            case (_, nil): return false
            case (let x?, let y?):
                return x == y ? a.student.lastName < b.student.lastName : x > y
            }
        }
    }

    public static func pinned(goals: [SessionGoal], pinnedIDs: Set<UUID>) -> [SessionGoal] {
        goals.filter { pinnedIDs.contains($0.id) }
    }

    static func daysBetween(_ from: Date, _ to: Date, _ calendar: Calendar) -> Int {
        let start = calendar.startOfDay(for: from)
        let end = calendar.startOfDay(for: to)
        return max(0, calendar.dateComponents([.day], from: start, to: end).day ?? 0)
    }

    public static func lastDataText(days: Int?) -> String {
        switch days {
        case nil: "No data yet"
        case 0?: "Data today"
        case 1?: "Last data yesterday"
        case let n?: "Last data \(n) days ago"
        }
    }
}
