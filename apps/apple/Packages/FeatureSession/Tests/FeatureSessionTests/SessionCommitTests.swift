import CoreModels
import Foundation
import Testing

@testable import FeatureSession

@Suite("SessionCommit")
struct SessionCommitTests {
    let student = Fixture.student()

    func plans(_ goals: [SessionGoal]) -> [UUID: MeasurementPlan] {
        Dictionary(uniqueKeysWithValues: goals.map { ($0.plan.id, $0.plan) })
    }

    @Test("trials become one point of correct out of total that passes validation")
    func trials() throws {
        let goal = Fixture.goal(for: student, type: .trials, target: 8, trials: 10)
        var draft = Fixture.draft([goal])
        let id = draft.entries[0].id
        for result in [TrialResult.correct, .correct, .incorrect] {
            draft.recordTrial(result, entry: id, at: t0)
        }
        draft.finish(at: t0.addingTimeInterval(300))
        let result = draft.commit(
            context: Fixture.context, plans: plans([goal]), at: t0.addingTimeInterval(300))
        let point = try #require(result.points.first)
        #expect(result.points.count == 1)
        #expect(point.correct == 2)
        #expect(point.total == 3)
        #expect(point.goalID == goal.goal.id)
        #expect(point.collectorID == Fixture.staff)
        #expect(result.rejected.isEmpty)
        try point.validate(against: goal.plan)
    }

    @Test("frequency and duration use the plan's unit")
    func frequencyAndDuration() throws {
        let freq = Fixture.goal(for: student, type: .frequency, unit: "initiations")
        let minutes = Fixture.goal(for: student, type: .duration, unit: "minutes", sequence: 2)
        let seconds = Fixture.goal(for: student, type: .duration, unit: "seconds", sequence: 3)
        var draft = Fixture.draft([freq, minutes, seconds])
        let ids = draft.entries.map(\.id)
        draft.adjustTally(by: 1, entry: ids[0], at: t0)
        draft.adjustTally(by: 1, entry: ids[0], at: t0)
        draft.toggleTimer(entry: ids[1], at: t0)
        draft.toggleTimer(entry: ids[1], at: t0.addingTimeInterval(150))
        draft.toggleTimer(entry: ids[2], at: t0)
        draft.toggleTimer(entry: ids[2], at: t0.addingTimeInterval(45))
        draft.finish(at: t0.addingTimeInterval(200))
        let result = draft.commit(
            context: Fixture.context, plans: plans([freq, minutes, seconds]),
            at: t0.addingTimeInterval(200))
        #expect(result.points.count == 3)
        #expect(result.points.first { $0.goalID == freq.goal.id }?.valueNum == 2)
        #expect(result.points.first { $0.goalID == minutes.goal.id }?.valueNum == 2.5)
        #expect(result.points.first { $0.goalID == seconds.goal.id }?.valueNum == 45)
    }

    @Test("a timer still running at the end is stopped and counted")
    func runningTimerAtEnd() throws {
        let goal = Fixture.goal(for: student, type: .duration, unit: "minutes")
        var draft = Fixture.draft([goal])
        draft.toggleTimer(entry: draft.entries[0].id, at: t0)
        draft.finish(at: t0.addingTimeInterval(600))
        let result = draft.commit(
            context: Fixture.context, plans: plans([goal]), at: t0.addingTimeInterval(600))
        #expect(result.points.first?.valueNum == 10)
    }

    @Test("prompt-level goals keep every trial as its own point")
    func promptLevel() throws {
        let goal = Fixture.goal(
            for: student, type: .promptLevel, prompts: ["independent", "gestural", "verbal"])
        var draft = Fixture.draft([goal])
        let id = draft.entries[0].id
        draft.recordPromptLevel("verbal", entry: id, at: t0)
        draft.recordPromptLevel("independent", entry: id, at: t0.addingTimeInterval(5))
        draft.finish(at: t0.addingTimeInterval(60))
        let result = draft.commit(
            context: Fixture.context, plans: plans([goal]), at: t0.addingTimeInterval(60))
        #expect(result.points.count == 2)
        #expect(result.points.map(\.promptLevel) == ["verbal", "independent"])
        #expect(result.points.map(\.valueNum) == [2, 0])
        #expect(result.rejected.isEmpty)
    }

    @Test("absent and refused leave a gap, not a point; other reasons ride in the note")
    func noData() throws {
        let a = Fixture.goal(for: student, type: .frequency)
        let b = Fixture.goal(for: student, type: .frequency, sequence: 2)
        var draft = Fixture.draft([a, b])
        let ids = draft.entries.map(\.id)
        draft.setNoData(.absent, entry: ids[0], at: t0)
        draft.adjustTally(by: 3, entry: ids[1], at: t0)
        draft.setNoData(.subTeacher, entry: ids[1], at: t0)
        draft.addNote("loud assembly", entry: ids[1], at: t0)
        draft.finish(at: t0.addingTimeInterval(60))
        let result = draft.commit(
            context: Fixture.context, plans: plans([a, b]), at: t0.addingTimeInterval(60))
        #expect(result.gaps == [NoDataGap(goalID: a.goal.id, studentID: student.id, reason: .absent)])
        #expect(result.points.count == 1)
        #expect(result.points[0].note == "Sub teacher; loud assembly")
    }

    @Test("an entry with nothing recorded makes no point")
    func empty() {
        let goal = Fixture.goal(for: student, type: .trials)
        var draft = Fixture.draft([goal])
        draft.finish(at: t0)
        let result = draft.commit(context: Fixture.context, plans: plans([goal]), at: t0)
        #expect(result.points.isEmpty)
        #expect(result.gaps.isEmpty)
    }

    @Test("a missing plan is reported, never dropped silently")
    func missingPlan() {
        let goal = Fixture.goal(for: student, type: .frequency)
        var draft = Fixture.draft([goal])
        draft.adjustTally(by: 1, entry: draft.entries[0].id, at: t0)
        draft.finish(at: t0)
        let result = draft.commit(context: Fixture.context, plans: [:], at: t0)
        #expect(result.points.isEmpty)
        #expect(result.rejected == [draft.entries[0].id])
    }
}
