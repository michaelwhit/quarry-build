import CoreModels
import Foundation

/// How many sessions a goal's schedule asks for in the current day, week (Monday start) or month,
/// and how many are already saved in that window. Matches the web practice app's Today tab.
public struct ScheduleDue: Hashable, Sendable {
    public enum Period: String, Sendable {
        case day, week, month

        public var phrase: String {
            switch self {
            case .day: "today"
            case .week: "this week"
            case .month: "this month"
            }
        }
    }

    public var period: Period
    public var required: Int
    public var done: Int
    public var isDue: Bool { done < required }

    /// Reads a plan's frequency text: "daily", "weekly", "monthly" or "Nx weekly". Anything else,
    /// or no text at all, counts as once a week.
    public static func make(
        frequency: String?, sessionDates: [Date], now: Date, calendar: Calendar = .current
    ) -> ScheduleDue {
        let text = (frequency ?? "").trimmingCharacters(in: .whitespaces).lowercased()
        let period: Period = text == "daily" ? .day : text == "monthly" ? .month : .week
        var required = 1
        if text.hasSuffix("x weekly"), let times = Int(text.dropLast("x weekly".count)) {
            required = max(1, times)
        }
        let today = calendar.startOfDay(for: now)
        let start: Date
        switch period {
        case .day:
            start = today
        case .week:
            // Monday start, whatever the calendar's own first weekday.
            let weekday = calendar.component(.weekday, from: today)  // 1 = Sunday
            let sinceMonday = (weekday + 5) % 7
            start = calendar.date(byAdding: .day, value: -sinceMonday, to: today) ?? today
        case .month:
            start = calendar.date(from: calendar.dateComponents([.year, .month], from: today))
                ?? today
        }
        let done = sessionDates.filter { $0 >= start && $0 <= now }.count
        return ScheduleDue(period: period, required: required, done: done)
    }
}

extension SessionGoal {
    /// Where this goal stands against its schedule at `now`.
    public func scheduleDue(now: Date, calendar: Calendar = .current) -> ScheduleDue {
        ScheduleDue.make(
            frequency: plan.frequency,
            sessionDates: history.filter { $0.planID == plan.id }.map(\.observedAt),
            now: now, calendar: calendar)
    }
}
