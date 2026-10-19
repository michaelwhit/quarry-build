import CoreModels
import Foundation
import Testing

@testable import FeatureSession

@MainActor
@Suite("Delivery that can fail")
struct DeliveryFailureTests {
    struct Refused: Error {}

    @MainActor
    final class FlakySink {
        var failing = true
        var attempts: [[DataPoint]] = []
        func take(_ points: [DataPoint]) throws {
            attempts.append(points)
            if failing { throw Refused() }
        }
    }

    @Test("a failed delivery keeps the draft, and a retry hands on the same points")
    func keepsDraftUntilDelivered() throws {
        let goal = Fixture.goal(for: Fixture.student(), type: .frequency, unit: "count")
        let store = MemoryDraftStore()
        let sink = FlakySink()
        let model = SessionModel(
            draft: Fixture.draft([goal]), goals: [goal], context: Fixture.context, store: store,
            clock: { t0 }, deliver: { try sink.take($0) })
        model.adjustTally(by: 2, entry: model.draft.entries[0].id)
        model.end()
        #expect(model.deliveryFailed)
        let kept = try #require(try store.load())
        #expect(kept.isEnded)
        #expect(kept.committedPoints?.count == 1)

        sink.failing = false
        model.retryDelivery()
        #expect(model.deliveryFailed == false)
        #expect(try store.load() == nil)
        #expect(sink.attempts.count == 2)
        #expect(sink.attempts[0].map(\.id) == sink.attempts[1].map(\.id))
    }

    @Test("a permanent failure keeps the data and can be set aside to free the next session")
    func permanentFailureSetAside() throws {
        let goal = Fixture.goal(for: Fixture.student(), type: .frequency, unit: "count")
        let store = MemoryDraftStore()
        let model = SessionModel(
            draft: Fixture.draft([goal]), goals: [goal], context: Fixture.context, store: store,
            clock: { t0 }, deliver: { _ in throw SessionDeliveryError() })
        model.adjustTally(by: 1, entry: model.draft.entries[0].id)
        model.end()
        #expect(model.deliveryFailed)
        #expect(model.deliveryIsPermanent)
        #expect(try store.load() != nil)

        model.setAside()
        #expect(model.deliveryFailed == false)
        #expect(try store.load() == nil)
        #expect(store.setAsideDrafts.count == 1)
        #expect(store.setAsideDrafts[0].committedPoints?.count == 1)
    }
}
