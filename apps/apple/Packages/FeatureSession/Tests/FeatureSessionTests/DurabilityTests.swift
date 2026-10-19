import CoreModels
import Foundation
import Testing

@testable import FeatureSession

/// A store whose writes can be made to fail, to check that the model never claims safety it lacks.
final class FlakyDraftStore: SessionDraftStoring, @unchecked Sendable {
    struct WriteFailed: Error {}
    private let lock = NSLock()
    private var draft: SessionDraft?
    private var failing = false

    var failWrites: Bool {
        get { lock.withLock { failing } }
        set { lock.withLock { failing = newValue } }
    }

    func load() throws -> SessionDraft? { lock.withLock { draft } }

    func save(_ draft: SessionDraft) throws {
        try lock.withLock {
            if failing { throw WriteFailed() }
            self.draft = draft
        }
    }

    func clear() throws { lock.withLock { draft = nil } }

    func setAside() throws { lock.withLock { draft = nil } }
}

/// Draft durability after an app kill, a reboot or a dead battery, checked
/// against the real file store. A "kill" here is dropping the model and reading the file again.
@MainActor
@Suite("Draft durability")
struct DurabilityTests {
    let student = Fixture.student()

    func tempURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("goalline-durability-\(UUID().uuidString)")
            .appendingPathComponent("draft.json")
    }

    func makeGoals() -> [SessionGoal] {
        [
            Fixture.goal(for: student, type: .trials, trials: 10, prompts: ["verbal"]),
            Fixture.goal(
                for: student, type: .promptLevel, prompts: ["independent", "verbal"], sequence: 2),
            Fixture.goal(for: student, type: .frequency, unit: "count", sequence: 3),
            Fixture.goal(for: student, type: .duration, unit: "minutes", sequence: 4),
        ]
    }

    func entryID(_ model: SessionModel, _ type: MeasurementType) throws -> UUID {
        try #require(model.draft.entries.first(where: { $0.type == type })).id
    }

    func make(
        _ goals: [SessionGoal], draft: SessionDraft? = nil, store: any SessionDraftStoring,
        clock: TestClock, sink: Sink
    ) -> SessionModel {
        SessionModel(
            draft: draft ?? Fixture.draft(goals), goals: goals, context: Fixture.context,
            store: store, clock: { clock.now }, deliver: { sink.take($0) })
    }

    @Test("every kind of change is on disk the moment it happens")
    func everyChangeIsOnDisk() throws {
        let goals = makeGoals()
        let url = tempURL()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        let store = FileDraftStore(url: url)
        let clock = TestClock()
        let model = make(goals, store: store, clock: clock, sink: Sink())
        let trials = try entryID(model, .trials)
        let levels = try entryID(model, .promptLevel)
        let count = try entryID(model, .frequency)
        let timer = try entryID(model, .duration)

        let changes: [() -> Void] = [
            { model.record(.correct, entry: trials, promptLevel: "verbal") },
            { model.record(.incorrect, entry: trials) },
            { model.flipTrial(at: 1, entry: trials) },
            { model.recordPromptLevel("verbal", entry: levels) },
            { model.adjustTally(by: 3, entry: count) },
            { model.toggleTimer(entry: timer) },
            { model.addNote("quiet room", entry: timer) },
            { model.setNoData(.shortSession, entry: trials) },
            { model.undo(entry: count) },
            { model.toggleTimer(entry: timer) },
        ]
        #expect(try store.load() == model.draft)  // the fresh draft is saved before any tap
        for change in changes {
            clock.advance(7)
            change()
            #expect(try store.load() == model.draft)
            #expect(!model.saveFailed)
        }
    }

    @Test("after a kill the draft comes back whole, with undo and a running timer")
    func killAndRelaunch() throws {
        let goals = makeGoals()
        let url = tempURL()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        let store = FileDraftStore(url: url)
        let clock = TestClock()
        let first = make(goals, store: store, clock: clock, sink: Sink())
        let count = try entryID(first, .frequency)
        let timer = try entryID(first, .duration)
        first.adjustTally(by: 2, entry: count)
        first.toggleTimer(entry: timer)  // timer started at t0
        let beforeKill = first.draft

        // The app is killed: nothing is kept but the file.
        let found = try #require(try store.load())
        #expect(found == beforeKill)

        clock.advance(10 * 60)  // the phone was off for ten minutes
        let sink = Sink()
        let relaunched = make(goals, draft: found, store: store, clock: clock, sink: sink)
        #expect(relaunched.draft.entries == found.entries)
        #expect(relaunched.draft.undoLog == found.undoLog)
        #expect(relaunched.canUndo(entry: count))
        #expect(relaunched.draft.entry(timer)?.runningSince == t0)

        relaunched.undo(entry: count)
        #expect(relaunched.draft.entry(count)?.tally == 0)

        clock.advance(5 * 60)
        relaunched.end()
        let points = try #require(sink.batches.first)
        let minutes = try #require(points.first(where: { $0.valueNum == 15 }))
        #expect(minutes.goalID == goals[3].goal.id)  // 15 minutes from the first start
    }

    @Test("a kill between ending and delivering repeats the same points, from the file")
    func killAfterEnd() throws {
        let goals = makeGoals()
        let url = tempURL()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        let store = FileDraftStore(url: url)
        let clock = TestClock()
        let seed = Sink()
        let model = make(goals, store: MemoryDraftStore(), clock: clock, sink: seed)
        model.adjustTally(by: 4, entry: try entryID(model, .frequency))
        model.record(.correct, entry: try entryID(model, .trials))
        model.end()
        let originalIDs = seed.batches[0].map(\.id)
        #expect(!originalIDs.isEmpty)

        // The ended draft reached the disk, then the app died before delivery finished.
        var ended = model.draft
        ended.committedPoints = seed.batches[0]
        try store.save(ended)

        let found = try #require(try store.load())
        #expect(found.isEnded)
        let sink = Sink()
        let relaunched = make(goals, draft: found, store: store, clock: clock, sink: sink)
        relaunched.resumeDelivery()
        #expect(try store.load() == nil)
        // A second delivery (a kill between delivering and clearing) must carry the same ids, so
        // the receiver can ignore the repeat.
        relaunched.resumeDelivery()
        #expect(sink.batches.count == 2)
        #expect(sink.batches[0].map(\.id) == originalIDs)
        #expect(sink.batches[1].map(\.id) == originalIDs)
    }

    @Test("a failed write is reported, taps still count, and the flag clears when writes recover")
    func failedWrite() throws {
        let goals = makeGoals()
        let store = FlakyDraftStore()
        let clock = TestClock()
        let model = make(goals, store: store, clock: clock, sink: Sink())
        let count = try entryID(model, .frequency)
        #expect(!model.saveFailed)

        store.failWrites = true
        model.adjustTally(by: 1, entry: count)
        #expect(model.saveFailed)
        #expect(model.draft.entry(count)?.tally == 1)  // the screen still shows the tap
        #expect(try store.load()?.entry(count)?.tally == 0)  // but the disk does not have it

        store.failWrites = false
        model.adjustTally(by: 1, entry: count)
        #expect(!model.saveFailed)
        #expect(try store.load()?.entry(count)?.tally == 2)
    }
}

/// Wall-clock problems during a session: a clock set back, or a phone whose time jumps.
@MainActor
@Suite("Clock changes during a session")
struct ClockChangeTests {
    let student = Fixture.student()

    func make(_ goals: [SessionGoal], clock: TestClock, sink: Sink) -> SessionModel {
        SessionModel(
            draft: Fixture.draft(goals), goals: goals, context: Fixture.context,
            store: MemoryDraftStore(), clock: { clock.now }, deliver: { sink.take($0) })
    }

    @Test("a clock set back while a timer runs never makes a negative duration")
    func clockSetBackWithTimer() throws {
        let goal = Fixture.goal(for: student, type: .duration, unit: "minutes")
        let clock = TestClock()
        let model = make([goal], clock: clock, sink: Sink())
        let id = model.draft.entries[0].id
        model.toggleTimer(entry: id)
        clock.advance(-120)
        #expect(try #require(model.draft.entry(id)).durationSeconds(at: clock.now) >= 0)
        model.toggleTimer(entry: id)
        let entry = try #require(model.draft.entry(id))
        #expect(entry.episodes.allSatisfy { $0 >= 0 })
        #expect(entry.durationSeconds(at: clock.now) >= 0)
    }

    @Test("a clock set back after a tap does not end the session as idle")
    func clockBehindLastTap() {
        let goal = Fixture.goal(for: student, type: .frequency, unit: "count")
        let clock = TestClock()
        let model = make([goal], clock: clock, sink: Sink())
        clock.advance(60)
        model.adjustTally(by: 1, entry: model.draft.entries[0].id)
        clock.advance(-3 * 3600)
        #expect(model.endIfIdle() == false)
        #expect(!model.isEnded)
    }

    @Test("ending with a clock behind the last tap still delivers the data")
    func endWithClockBehind() throws {
        let goal = Fixture.goal(for: student, type: .frequency, unit: "count")
        let clock = TestClock()
        let sink = Sink()
        let model = make([goal], clock: clock, sink: sink)
        clock.advance(600)
        model.adjustTally(by: 3, entry: model.draft.entries[0].id)
        clock.advance(-3600)
        model.end()
        let point = try #require(sink.batches.first?.first)
        #expect(point.valueNum == 3)
    }
}
