import CoreModels
import Foundation
import Testing

@testable import FeatureSession

@Suite("SessionDraft")
struct SessionDraftTests {
    let student = Fixture.student()

    @Test("records trials and counts them")
    func trials() throws {
        let goal = Fixture.goal(for: student, type: .trials, trials: 10)
        var draft = Fixture.draft([goal])
        let id = draft.entries[0].id
        draft.recordTrial(.correct, entry: id, at: t0)
        draft.recordTrial(.incorrect, entry: id, at: t0)
        draft.recordTrial(.correct, entry: id, promptLevel: "verbal", at: t0)
        let entry = try #require(draft.entry(id))
        #expect(entry.correctCount == 2)
        #expect(entry.incorrectCount == 1)
        #expect(entry.trials.count == 3)
        #expect(entry.plannedTrials == 10)
    }

    @Test("undo removes the latest action for that goal only")
    func undoIsPerGoal() throws {
        let a = Fixture.goal(for: student, type: .trials)
        let b = Fixture.goal(for: student, type: .frequency, unit: "count", sequence: 2)
        var draft = Fixture.draft([a, b])
        let first = draft.entries[0].id
        let second = draft.entries[1].id
        draft.recordTrial(.correct, entry: first, at: t0)
        draft.adjustTally(by: 1, entry: second, at: t0)
        draft.recordTrial(.incorrect, entry: first, at: t0)

        let undoneOnce = draft.undo(entry: first, at: t0)
        #expect(undoneOnce)
        #expect(try #require(draft.entry(first)).trials.count == 1)
        #expect(try #require(draft.entry(second)).tally == 1)

        let undoneTwice = draft.undo(entry: first, at: t0)
        let nothingLeft = draft.undo(entry: first, at: t0)
        #expect(undoneTwice)
        #expect(nothingLeft == false)
        #expect(try #require(draft.entry(first)).trials.isEmpty)
        #expect(try #require(draft.entry(second)).tally == 1)
    }

    @Test("the tally never goes below zero and a refused change is not undoable")
    func tallyFloor() throws {
        var draft = Fixture.draft([Fixture.goal(for: student, type: .frequency)])
        let id = draft.entries[0].id
        draft.adjustTally(by: -1, entry: id, at: t0)
        #expect(try #require(draft.entry(id)).tally == 0)
        #expect(draft.undoLog.isEmpty)
        draft.adjustTally(by: 1, entry: id, at: t0)
        draft.adjustTally(by: 1, entry: id, at: t0)
        draft.adjustTally(by: -1, entry: id, at: t0)
        #expect(try #require(draft.entry(id)).tally == 1)
        draft.undo(entry: id, at: t0)
        #expect(try #require(draft.entry(id)).tally == 2)
    }

    @Test("timer episodes add up and undoing a stop resumes the timer")
    func timer() throws {
        var draft = Fixture.draft([Fixture.goal(for: student, type: .duration, unit: "minutes")])
        let id = draft.entries[0].id
        draft.toggleTimer(entry: id, at: t0)
        draft.toggleTimer(entry: id, at: t0.addingTimeInterval(90))
        draft.toggleTimer(entry: id, at: t0.addingTimeInterval(120))
        let running = try #require(draft.entry(id))
        #expect(running.episodes == [90])
        #expect(running.durationSeconds(at: t0.addingTimeInterval(150)) == 120)

        draft.toggleTimer(entry: id, at: t0.addingTimeInterval(180))
        #expect(try #require(draft.entry(id)).episodes == [90, 60])
        draft.undo(entry: id, at: t0.addingTimeInterval(181))
        let resumed = try #require(draft.entry(id))
        #expect(resumed.episodes == [90])
        #expect(resumed.runningSince == t0.addingTimeInterval(120))
    }

    @Test("prompt levels outside the hierarchy are ignored")
    func promptLevels() throws {
        var draft = Fixture.draft([
            Fixture.goal(for: student, type: .promptLevel, prompts: ["independent", "verbal"])
        ])
        let id = draft.entries[0].id
        draft.recordPromptLevel("verbal", entry: id, at: t0)
        draft.recordPromptLevel("telepathy", entry: id, at: t0)
        #expect(try #require(draft.entry(id)).trials.count == 1)
    }

    @Test("a tapped trial can be flipped")
    func flip() throws {
        var draft = Fixture.draft([Fixture.goal(for: student, type: .trials)])
        let id = draft.entries[0].id
        draft.recordTrial(.correct, entry: id, at: t0)
        draft.flipTrial(at: 0, entry: id, at: t0)
        #expect(try #require(draft.entry(id)).trials[0].result == .incorrect)
        draft.flipTrial(at: 5, entry: id, at: t0)  // out of range: no crash, no change
        #expect(try #require(draft.entry(id)).trials.count == 1)
    }

    @Test("goals the session screen cannot run are left out")
    func unsupported() {
        let rate = Fixture.goal(for: student, type: .rate)
        let freq = Fixture.goal(for: student, type: .frequency, sequence: 2)
        let draft = Fixture.draft([rate, freq])
        #expect(draft.entries.count == 1)
        #expect(draft.entries[0].goalID == freq.goal.id)
        #expect(rate.isSupported == false)
    }

    @Test("idle after twenty minutes, but never while a timer runs")
    func idle() {
        var draft = Fixture.draft([Fixture.goal(for: student, type: .duration)])
        let id = draft.entries[0].id
        #expect(draft.isIdle(at: t0.addingTimeInterval(19 * 60)) == false)
        #expect(draft.isIdle(at: t0.addingTimeInterval(20 * 60)))
        draft.toggleTimer(entry: id, at: t0)
        #expect(draft.isIdle(at: t0.addingTimeInterval(60 * 60)) == false)
    }

    @Test("an ended draft refuses edits")
    func endedIsFrozen() throws {
        var draft = Fixture.draft([Fixture.goal(for: student, type: .frequency)])
        let id = draft.entries[0].id
        draft.finish(at: t0.addingTimeInterval(60))
        draft.adjustTally(by: 1, entry: id, at: t0)
        #expect(try #require(draft.entry(id)).tally == 0)
    }

    @Test("a note and a no-data reason are recorded and undoable")
    func notesAndReasons() throws {
        var draft = Fixture.draft([Fixture.goal(for: student, type: .trials)])
        let id = draft.entries[0].id
        draft.addNote("  fire drill  ", entry: id, at: t0)
        draft.addNote("   ", entry: id, at: t0)
        draft.setNoData(.absent, entry: id, at: t0)
        draft.setNoData(.absent, entry: id, at: t0)  // same value: no second log entry
        #expect(try #require(draft.entry(id)).notes == ["fire drill"])
        #expect(draft.undoLog.count == 2)
        draft.undo(entry: id, at: t0)
        #expect(try #require(draft.entry(id)).noDataReason == nil)
    }
}
