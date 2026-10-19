import CoreModels
import Foundation
import Testing

@testable import FeatureSession

@Suite("FileDraftStore")
struct FileDraftStoreTests {
    func tempURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("demo-draft-\(UUID().uuidString)")
            .appendingPathComponent("draft.json")
    }

    @Test("a draft survives being written and read back")
    func roundTrip() throws {
        let url = tempURL()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        let store = FileDraftStore(url: url)
        #expect(try store.load() == nil)

        let student = Fixture.student()
        let goal = Fixture.goal(for: student, type: .trials, trials: 10, prompts: ["verbal"])
        var draft = Fixture.draft([goal])
        let id = draft.entries[0].id
        draft.recordTrial(.correct, entry: id, promptLevel: "verbal", at: t0)
        draft.addNote("quiet room", entry: id, at: t0)
        try store.save(draft)
        #expect(try store.load() == draft)

        try store.clear()
        #expect(try store.load() == nil)
        try store.clear()  // clearing twice is fine
    }

    @Test("saving again replaces the file")
    func overwrite() throws {
        let url = tempURL()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        let store = FileDraftStore(url: url)
        let goal = Fixture.goal(for: Fixture.student(), type: .frequency)
        var draft = Fixture.draft([goal])
        try store.save(draft)
        draft.adjustTally(by: 1, entry: draft.entries[0].id, at: t0)
        try store.save(draft)
        #expect(try store.load()?.entries[0].tally == 1)
    }
}

@Suite("Privacy and Today")
struct TodayTests {
    @Test("initials replace names when privacy is on")
    func initials() {
        let maya = Fixture.student("Maya", "Lindqvist")
        #expect(PrivacyLabel.initials(for: maya) == "M.L.")
        #expect(PrivacyLabel.label(for: maya, hidden: true) == "M.L.")
        #expect(PrivacyLabel.label(for: maya, hidden: false) == maya.displayName)
        let nameless = Fixture.student("", "")
        #expect(PrivacyLabel.initials(for: nameless) == "?")
    }

    @Test("a student keeps the same color all day")
    func hue() {
        let id = UUIDv7.make()
        #expect(PrivacyLabel.hue(for: id) == PrivacyLabel.hue(for: id))
        #expect((0..<1).contains(PrivacyLabel.hue(for: id)))
    }

    @Test("Today puts the student longest without data first")
    func ordering() {
        let fresh = Fixture.student("Fern", "Adams")
        let stale = Fixture.student("Stan", "Brooks")
        let never = Fixture.student("Nia", "Cole")
        let now = t0
        // History sits at `now - n days`; the fixture spaces points one day apart ending yesterday.
        let freshGoal = Fixture.goal(for: fresh, type: .trials, history: [5])
        var staleGoal = Fixture.goal(for: stale, type: .trials, history: [5])
        staleGoal.history = staleGoal.history.map {
            var p = $0
            p.observedAt = now.addingTimeInterval(-9 * 86_400)
            return p
        }
        let neverGoal = Fixture.goal(for: never, type: .trials)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let cards = TodayPlanner.cards(
            goals: [freshGoal, staleGoal, neverGoal], now: now, calendar: calendar)
        #expect(cards.map(\.student.firstName) == ["Nia", "Stan", "Fern"])
        #expect(cards[0].daysSinceData == nil)
        #expect(cards[1].daysSinceData == 9)
    }

    @Test("last-data text reads naturally")
    func text() {
        #expect(TodayPlanner.lastDataText(days: nil) == "No data yet")
        #expect(TodayPlanner.lastDataText(days: 0) == "Data today")
        #expect(TodayPlanner.lastDataText(days: 1) == "Last data yesterday")
        #expect(TodayPlanner.lastDataText(days: 4) == "Last data 4 days ago")
    }
}
