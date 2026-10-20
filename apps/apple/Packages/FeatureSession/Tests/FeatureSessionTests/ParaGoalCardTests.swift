import CoreModels
import Foundation
import Testing

@testable import FeatureSession

@Suite("ParaGoalCard")
struct ParaGoalCardTests {
    func item(_ student: Student, _ statement: String, sequence: Int = 1) -> SessionGoal {
        var goal = Fixture.goal(for: student, type: .trials, trials: 10, sequence: sequence)
        goal.goal.statement = statement
        return goal
    }

    @Test("a short goal is shown whole and has nothing more to open")
    func shortGoal() {
        let student = Fixture.student("Maya", "Lindqvist")
        let cards = ParaGoalCard.cards(from: [item(student, "Read ten words.")])
        #expect(cards.count == 1)
        #expect(cards[0].shortText == "Read ten words.")
        #expect(cards[0].fullText == "Read ten words.")
        #expect(!cards[0].hasMore)
        #expect(cards[0].canStart)
    }

    @Test("a long goal is cut at a word and the full text stays available")
    func longGoal() {
        let student = Fixture.student()
        let long = String(repeating: "alpha ", count: 30).trimmingCharacters(in: .whitespaces)
        let card = ParaGoalCard.cards(from: [item(student, long)])[0]
        #expect(card.shortText.hasSuffix("alpha…"))
        #expect(card.shortText.count <= 101)
        #expect(card.fullText == long)
        #expect(card.hasMore)
    }

    @Test("a scoring note is carried, and a blank one is dropped")
    func scoringNote() {
        let student = Fixture.student()
        let withNote = item(student, "Read ten words.")
        let blank = item(student, "Count to five.", sequence: 2)
        let cards = ParaGoalCard.cards(
            from: [withNote, blank],
            scoringNotes: [withNote.goal.id: "Count only unprompted words.", blank.goal.id: "  "])
        #expect(cards[0].scoringNote == "Count only unprompted words.")
        #expect(cards[0].hasMore)
        #expect(cards[1].scoringNote == nil)
    }

    @Test("a card names the student by preferred or first name and never shows the last name")
    func names() {
        var preferred = Fixture.student("Margaret", "Lindqvist")
        preferred.preferredName = "Maggie"
        let plain = Fixture.student("Omar", "Pebbleford")
        let cards = ParaGoalCard.cards(from: [item(plain, "Goal."), item(preferred, "Goal.")])
        #expect(cards.map(\.studentName) == ["Maggie", "Omar"])
        #expect(cards.allSatisfy { !$0.studentName.contains("Lindqvist") })
        #expect(cards.allSatisfy { !$0.studentName.contains("Pebbleford") && !$0.studentName.contains(".") })
    }

    @Test("two students who share a first name keep their own goals together")
    func sharedFirstName() {
        let first = Fixture.student("Sam", "Pebbleford")
        let second = Fixture.student("Sam", "Underbough")
        let cards = ParaGoalCard.cards(from: [
            item(first, "A1.", sequence: 1), item(second, "B1.", sequence: 1),
            item(first, "A2.", sequence: 2), item(second, "B2.", sequence: 2),
        ])
        let groups = cards.map(\.studentID)
        #expect(groups[0] == groups[1] && groups[2] == groups[3] && groups[1] != groups[2])
        #expect(cards.filter { $0.studentID == first.id }.map(\.fullText) == ["A1.", "A2."])
    }

    @Test("cards keep goal order within a student")
    func order() {
        let student = Fixture.student()
        let cards = ParaGoalCard.cards(from: [
            item(student, "Second.", sequence: 2), item(student, "First.", sequence: 1),
        ])
        #expect(cards.map(\.fullText) == ["First.", "Second."])
    }

    @Test("a goal the session screen cannot record is listed but cannot start")
    func unsupported() {
        let student = Fixture.student()
        let goal = Fixture.goal(for: student, type: .rubric)
        let card = ParaGoalCard.cards(from: [goal])[0]
        #expect(!card.canStart)
    }

    @Test("no goals gives no cards")
    func empty() {
        #expect(ParaGoalCard.cards(from: []).isEmpty)
    }
}
