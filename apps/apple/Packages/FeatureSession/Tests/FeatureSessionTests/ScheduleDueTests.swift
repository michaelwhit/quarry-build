import CoreModels
import Foundation
import Testing

@testable import FeatureSession

@Suite("ScheduleDue")
struct ScheduleDueTests {
    static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }()

    /// Wednesday, October 21, 2026, noon.
    let wednesday = ScheduleDueTests.date(2026, 10, 21, hour: 12)

    static func date(_ y: Int, _ m: Int, _ d: Int, hour: Int = 9) -> Date {
        calendar.date(from: DateComponents(year: y, month: m, day: d, hour: hour))!
    }

    func due(_ frequency: String?, _ days: [Date]) -> ScheduleDue {
        ScheduleDue.make(
            frequency: frequency, sessionDates: days, now: wednesday, calendar: Self.calendar)
    }

    @Test("a daily goal needs one session a day")
    func daily() {
        #expect(due("daily", []).required == 1)
        #expect(due("daily", []).isDue)
        #expect(!due("daily", [Self.date(2026, 10, 21)]).isDue)
        #expect(due("daily", [Self.date(2026, 10, 20)]).isDue)
    }

    @Test("weekly goals count from Monday")
    func weekly() {
        let lastSundayAndMonday = [Self.date(2026, 10, 18), Self.date(2026, 10, 19)]
        let twice = due("2x weekly", lastSundayAndMonday)
        #expect(twice.period == .week)
        #expect(twice.required == 2)
        #expect(twice.done == 1)
        #expect(twice.isDue)
        #expect(!due("2x weekly", lastSundayAndMonday + [Self.date(2026, 10, 21)]).isDue)
        #expect(due("weekly", [Self.date(2026, 10, 18)]).isDue)
    }

    @Test("monthly goals count the calendar month")
    func monthly() {
        #expect(!due("monthly", [Self.date(2026, 10, 2)]).isDue)
        #expect(due("monthly", [Self.date(2026, 9, 30)]).isDue)
    }

    @Test("missing or unreadable text counts as once a week")
    func fallback() {
        for text in [nil, "", "as needed", "0x weekly"] {
            let result = due(text, [])
            #expect(result.period == .week)
            #expect(result.required == 1)
        }
    }

    @Test("a session after now does not count")
    func future() {
        #expect(due("daily", [Self.date(2026, 10, 21, hour: 18)]).isDue)
    }

    @Test("a student with a goal due sorts into To do; the card knows what is due")
    func card() {
        let student = Fixture.student()
        var caughtUp = Fixture.goal(for: student, type: .trials, sequence: 1, history: [5], frequency: "weekly")
        caughtUp.history = caughtUp.history.map {
            var point = $0
            point.observedAt = Self.date(2026, 10, 20)
            return point
        }
        let open = Fixture.goal(for: student, type: .trials, sequence: 2, frequency: "daily")
        let cards = TodayPlanner.cards(
            goals: [caughtUp, open], now: wednesday, calendar: Self.calendar)
        #expect(cards.count == 1)
        #expect(cards[0].hasDue)
        #expect(cards[0].dueGoals.map(\.id) == [open.id])
        #expect(cards[0].caughtUpCount == 1)
    }

    @Test("a goal the session screen cannot run does not put the student under To do")
    func unsupportedNotDue() {
        let student = Fixture.student()
        let unsupported = Fixture.goal(for: student, type: .rubric, frequency: "daily")
        #expect(!unsupported.isSupported)
        let cards = TodayPlanner.cards(
            goals: [unsupported], now: wednesday, calendar: Self.calendar)
        #expect(cards.count == 1)
        #expect(!cards[0].hasDue)
        #expect(cards[0].caughtUpCount == 1)
        #expect(cards[0].now == wednesday)
    }
}
