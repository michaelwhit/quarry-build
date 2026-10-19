import Foundation

/// A pausable timer for duration and latency goals. Time is passed in, never read from a clock,
/// so the arithmetic is testable and a backgrounded app keeps the right elapsed time.
public struct Stopwatch: Equatable, Sendable {
    private var accumulated: TimeInterval = 0
    private var startedAt: Date?

    public init() {}

    public var isRunning: Bool { startedAt != nil }

    public mutating func start(at now: Date) {
        if startedAt == nil { startedAt = now }
    }

    public mutating func stop(at now: Date) {
        guard let started = startedAt else { return }
        accumulated += max(0, now.timeIntervalSince(started))
        startedAt = nil
    }

    public mutating func reset() {
        accumulated = 0
        startedAt = nil
    }

    public func elapsed(at now: Date) -> TimeInterval {
        guard let started = startedAt else { return accumulated }
        return accumulated + max(0, now.timeIntervalSince(started))
    }

    /// Elapsed time in minutes to two decimals, capped at the data sheet's limit.
    public func minutes(at now: Date, limit: Double = 240) -> Double {
        let value = (elapsed(at: now) / 60 * 100).rounded() / 100
        return min(value, limit)
    }

    /// "m:ss" for display.
    public func display(at now: Date) -> String {
        let total = Int(elapsed(at: now))
        return "\(total / 60):" + String(format: "%02d", total % 60)
    }
}
