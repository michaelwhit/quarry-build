import Foundation
import Testing

@testable import FeatureDataCollection

@Suite("Stopwatch")
struct StopwatchTests {
    private let t0 = Date(timeIntervalSince1970: 1_000_000)

    @Test("counts time while running and holds it when stopped")
    func runAndStop() {
        var watch = Stopwatch()
        watch.start(at: t0)
        #expect(watch.isRunning)
        #expect(watch.elapsed(at: t0.addingTimeInterval(90)) == 90)
        watch.stop(at: t0.addingTimeInterval(90))
        #expect(!watch.isRunning)
        #expect(watch.elapsed(at: t0.addingTimeInterval(500)) == 90)
    }

    @Test("resumes and adds to earlier time")
    func resume() {
        var watch = Stopwatch()
        watch.start(at: t0)
        watch.stop(at: t0.addingTimeInterval(30))
        watch.start(at: t0.addingTimeInterval(100))
        #expect(watch.elapsed(at: t0.addingTimeInterval(130)) == 60)
    }

    @Test("a second start does not restart the clock")
    func doubleStart() {
        var watch = Stopwatch()
        watch.start(at: t0)
        watch.start(at: t0.addingTimeInterval(20))
        #expect(watch.elapsed(at: t0.addingTimeInterval(30)) == 30)
    }

    @Test("a clock that goes backwards never gives negative time")
    func backwards() {
        var watch = Stopwatch()
        watch.start(at: t0)
        #expect(watch.elapsed(at: t0.addingTimeInterval(-10)) == 0)
    }

    @Test("minutes round to two decimals and respect the limit")
    func minutes() {
        var watch = Stopwatch()
        watch.start(at: t0)
        #expect(watch.minutes(at: t0.addingTimeInterval(100)) == 1.67)
        #expect(watch.minutes(at: t0.addingTimeInterval(100_000)) == 240)
    }

    @Test("display shows minutes and padded seconds")
    func display() {
        var watch = Stopwatch()
        watch.start(at: t0)
        #expect(watch.display(at: t0.addingTimeInterval(65)) == "1:05")
        watch.reset()
        #expect(watch.display(at: t0) == "0:00")
    }
}
