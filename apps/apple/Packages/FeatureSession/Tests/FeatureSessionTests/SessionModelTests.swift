import CoreModels
import Foundation
import Testing

@testable import FeatureSession

/// Collects what the model hands on, on the main actor.
@MainActor
final class Sink {
    var batches: [[DataPoint]] = []
    func take(_ points: [DataPoint]) { batches.append(points) }
}

@MainActor
@Suite("SessionModel")
struct SessionModelTests {
    let student = Fixture.student()

    func make(
        _ goals: [SessionGoal], store: MemoryDraftStore, clock: TestClock, sink: Sink
    ) -> SessionModel {
        SessionModel(
            draft: Fixture.draft(goals), goals: goals, context: Fixture.context, store: store,
            clock: { clock.now }, deliver: { sink.take($0) })
    }

    @Test("every tap is saved before anything else happens")
    func savesEveryTap() throws {
        let goal = Fixture.goal(for: student, type: .trials)
        let store = MemoryDraftStore()
        let model = make([goal], store: store, clock: TestClock(), sink: Sink())
        let id = model.draft.entries[0].id
        let before = store.saveCount
        model.record(.correct, entry: id)
        model.record(.incorrect, entry: id)
        #expect(store.saveCount == before + 2)
        let saved = try #require(try store.load())
        #expect(saved.entries[0].trials.count == 2)
    }

    @Test("ending delivers the points once and clears the draft")
    func endDelivers() throws {
        let goal = Fixture.goal(for: student, type: .frequency, unit: "count")
        let store = MemoryDraftStore()
        let sink = Sink()
        let clock = TestClock()
        let model = make([goal], store: store, clock: clock, sink: sink)
        let id = model.draft.entries[0].id
        model.adjustTally(by: 1, entry: id)
        clock.advance(120)
        model.end()
        model.end()  // a second press does nothing
        #expect(sink.batches.count == 1)
        #expect(sink.batches[0].count == 1)
        #expect(model.isEnded)
        #expect(model.summaries.count == 1)
        #expect(try store.load() == nil)
        model.adjustTally(by: 1, entry: id)  // frozen after the end
        #expect(sink.batches.count == 1)
    }

    @Test("a crash between ending and delivering repeats the same points")
    func crashRecovery() throws {
        let goal = Fixture.goal(for: student, type: .frequency, unit: "count")
        let store = MemoryDraftStore()
        let clock = TestClock()
        let first = Sink()
        let model = make([goal], store: store, clock: clock, sink: first)
        model.adjustTally(by: 1, entry: model.draft.entries[0].id)
        model.end()
        let originalIDs = first.batches[0].map(\.id)

        // Simulate a kill after the ended draft was saved but before delivery finished.
        var ended = model.draft
        ended.committedPoints = first.batches[0]
        let crashedStore = MemoryDraftStore(ended)
        let second = Sink()
        let relaunched = SessionModel(
            draft: ended, goals: [goal], context: Fixture.context, store: crashedStore,
            clock: { clock.now }, deliver: { second.take($0) })
        relaunched.resumeDelivery()
        #expect(second.batches.count == 1)
        #expect(second.batches[0].map(\.id) == originalIDs)
        #expect(try crashedStore.load() == nil)
    }

    @Test("a session left alone for twenty minutes ends itself and keeps the data")
    func autoEnd() {
        let goal = Fixture.goal(for: student, type: .frequency, unit: "count")
        let sink = Sink()
        let clock = TestClock()
        let model = make([goal], store: MemoryDraftStore(), clock: clock, sink: sink)
        model.adjustTally(by: 2, entry: model.draft.entries[0].id)
        clock.advance(19 * 60)
        #expect(model.endIfIdle() == false)
        clock.advance(2 * 60)
        #expect(model.endIfIdle())
        #expect(sink.batches.first?.first?.valueNum == 2)
    }

    @Test("haptics fire on every change but not on a refused one")
    func haptics() {
        let goal = Fixture.goal(for: student, type: .frequency)
        var ticks = 0
        let model = SessionModel(
            draft: Fixture.draft([goal]), goals: [goal], context: Fixture.context,
            store: MemoryDraftStore(), clock: { t0 }, haptic: { ticks += 1 }, deliver: { _ in })
        let id = model.draft.entries[0].id
        model.adjustTally(by: 1, entry: id)
        model.undo(entry: id)
        #expect(ticks == 2)
    }

    @Test("summary compares today with the recent average")
    func summary() throws {
        let goal = Fixture.goal(
            for: student, type: .trials, target: 8, trials: 10, history: [4, 5, 6, 5])
        let sink = Sink()
        let clock = TestClock()
        let model = make([goal], store: MemoryDraftStore(), clock: clock, sink: sink)
        let id = model.draft.entries[0].id
        for _ in 0..<8 { model.record(.correct, entry: id) }
        for _ in 0..<2 { model.record(.incorrect, entry: id) }
        model.end()
        let summary = try #require(model.summaries.first)
        #expect(summary.todayText == "8 of 10")
        #expect(summary.todayValue == 8)
        #expect(summary.recent == [4, 5, 6, 5])
        #expect(summary.trend == .up)
    }
}
