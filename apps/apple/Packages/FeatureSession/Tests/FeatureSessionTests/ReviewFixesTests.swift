import CoreModels
import Foundation
import Testing

@testable import FeatureSession

@Suite("Review fixes")
struct ReviewFixesTests {
    let student = Fixture.student("Zeke", "Larsen")

    func plans(_ goals: [SessionGoal]) -> [UUID: MeasurementPlan] {
        Dictionary(uniqueKeysWithValues: goals.map { ($0.plan.id, $0.plan) })
    }

    @Test("hiding names removes the student's name from goal text")
    func hidesNamesInStatements() {
        let statements = [
            "During seat work, Zeke will stay on task in 4 of 5 trials.",
            "By June, zeke larsen will read 40 words per minute.",
            "Larsen will ask for help.",
        ]
        for text in statements {
            let hidden = PrivacyLabel.text(text, for: student, hidden: true)
            #expect(!hidden.lowercased().contains("zeke"))
            #expect(!hidden.lowercased().contains("larsen"))
            #expect(hidden.contains("Z.L."))
            #expect(PrivacyLabel.text(text, for: student, hidden: false) == text)
        }
    }

    @Test("a short name does not rewrite other words")
    func shortNameWholeWordsOnly() {
        let max = Fixture.student("Max", "Oh")
        let hidden = PrivacyLabel.text("Max will reach the maximum of 5 words.", for: max, hidden: true)
        #expect(hidden == "M.O. will reach the maximum of 5 words.")
    }

    @Test("a preferred name is hidden too")
    func hidesPreferredName() {
        var named = student
        named.preferredName = "Ez"
        let hidden = PrivacyLabel.text("Ez will wait his turn.", for: named, hidden: true)
        #expect(!hidden.contains("Ez"))
    }

    @Test("a prompt-level note rides on the last point only")
    func promptNoteOnce() throws {
        let goal = Fixture.goal(
            for: student, type: .promptLevel, prompts: ["independent", "verbal"])
        var draft = Fixture.draft([goal])
        let id = draft.entries[0].id
        draft.recordPromptLevel("verbal", entry: id, at: t0)
        draft.recordPromptLevel("independent", entry: id, at: t0.addingTimeInterval(5))
        draft.addNote("fire drill", entry: id, at: t0.addingTimeInterval(6))
        draft.finish(at: t0.addingTimeInterval(60))
        let result = draft.commit(
            context: Fixture.context, plans: plans([goal]), at: t0.addingTimeInterval(60))
        let notes = result.points.map(\.note)
        #expect(notes.count == 2)
        #expect(notes[0] == nil)
        #expect(try #require(notes[1]).contains("fire drill"))
    }

    @Test("a note with no taps is reported, not dropped")
    func noteWithoutTaps() {
        let trials = Fixture.goal(for: student, type: .trials)
        let timer = Fixture.goal(for: student, type: .duration, unit: "minutes", sequence: 2)
        var draft = Fixture.draft([trials, timer])
        let ids = draft.entries.map(\.id)
        draft.setNoData(.shortSession, entry: ids[0], at: t0)
        draft.addNote("pulled out early", entry: ids[1], at: t0)
        draft.finish(at: t0.addingTimeInterval(60))
        let result = draft.commit(
            context: Fixture.context, plans: plans([trials, timer]),
            at: t0.addingTimeInterval(60))
        #expect(result.points.isEmpty)
        #expect(Set(result.rejected) == Set(ids))
    }

    @Test("absent after trials keeps the trials and notes the reason")
    func absentKeepsData() throws {
        let goal = Fixture.goal(for: student, type: .trials)
        var draft = Fixture.draft([goal])
        let id = draft.entries[0].id
        for result in [TrialResult.correct, .correct, .incorrect] {
            draft.recordTrial(result, entry: id, at: t0)
        }
        draft.setNoData(.absent, entry: id, at: t0)
        draft.finish(at: t0.addingTimeInterval(60))
        let result = draft.commit(
            context: Fixture.context, plans: plans([goal]), at: t0.addingTimeInterval(60))
        let point = try #require(result.points.first)
        #expect(result.gaps.isEmpty)
        #expect(point.correct == 2)
        #expect(point.total == 3)
        #expect(try #require(point.note).contains("Absent"))
    }
}

@MainActor
@Suite("Idle end and resume")
struct IdleEndTests {
    let student = Fixture.student()

    func make(
        _ goals: [SessionGoal], draft: SessionDraft? = nil, clock: TestClock, sink: Sink
    ) -> SessionModel {
        SessionModel(
            draft: draft ?? Fixture.draft(goals), goals: goals, context: Fixture.context,
            store: MemoryDraftStore(), clock: { clock.now }, deliver: { sink.take($0) })
    }

    @Test("an idle end is dated at the last tap, not when the app noticed")
    func idleEndDatedAtLastTap() throws {
        let goal = Fixture.goal(for: student, type: .frequency, unit: "count")
        let clock = TestClock()
        let sink = Sink()
        let model = make([goal], clock: clock, sink: sink)
        clock.advance(60)
        model.adjustTally(by: 2, entry: model.draft.entries[0].id)
        let lastTap = clock.now
        clock.advance(10 * 3600)
        #expect(model.endIfIdle())
        let point = try #require(sink.batches.first?.first)
        #expect(point.observedAt == lastTap)
    }

    @Test("a draft resumed after a long gap is not ended at once")
    func resumeRestartsIdleClock() {
        let goal = Fixture.goal(for: student, type: .frequency, unit: "count")
        var draft = Fixture.draft([goal])
        draft.adjustTally(by: 1, entry: draft.entries[0].id, at: t0)
        let clock = TestClock(t0.addingTimeInterval(3 * 3600))
        let model = make([goal], draft: draft, clock: clock, sink: Sink())
        #expect(model.endIfIdle() == false)
        #expect(model.draft.lastActivityAt == clock.now)
    }
}
