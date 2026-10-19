import Foundation

extension DataPoint {
    /// The number plotted on a graph for this observation, in the plan's natural unit
    /// (percent, count correct, minutes, prompt-level index and so on).
    public func chartValue(for plan: MeasurementPlan) -> Double? {
        switch plan.type {
        case .trials, .yesNo, .taskAnalysis:
            return correct.map(Double.init)
        default:
            return valueNum
        }
    }

    /// A short human-readable result, such as "7 of 10", "72%" or "verbal prompt".
    public func summary(for plan: MeasurementPlan) -> String {
        switch plan.type {
        case .trials, .yesNo:
            guard let correct, let total else { return "-" }
            return "\(correct) of \(total)"
        case .taskAnalysis:
            guard let correct, let total else { return "-" }
            return "\(correct) of \(total) steps"
        case .promptLevel:
            return promptLevel ?? "-"
        default:
            guard let valueNum else { return "-" }
            return ValueFormat.string(valueNum, for: plan)
        }
    }
}

public enum ValueFormat {
    /// Formats a plotted value with the plan's unit ("72%", "3.5 minutes", "4").
    public static func string(_ value: Double, for plan: MeasurementPlan) -> String {
        let rounded = (value * 10).rounded() / 10
        let number =
            rounded == rounded.rounded() ? String(Int(rounded)) : String(rounded)
        switch plan.type {
        case .percentCorrect:
            return "\(number)%"
        case .trials, .yesNo:
            return number
        case .promptLevel:
            let levels = plan.promptHierarchy
            let index = Int(value.rounded())
            return levels.indices.contains(index) ? levels[index] : number
        default:
            guard let unit = plan.unit, !unit.isEmpty else { return number }
            return "\(number) \(unit)"
        }
    }
}

/// The picture of how a goal is going: the plotted samples, the target, and simple statistics.
///
/// Prototype rules, not the final Sufficient calculation. The real rule for the
/// SRS progress report; this exists so the demo can show a graph, a trend
/// and a suggested Yes/No.
public struct GoalProgress: Sendable {
    public struct Sample: Identifiable, Hashable, Sendable {
        public let id: UUID
        public let date: Date
        public let value: Double
    }

    public let plan: MeasurementPlan
    /// Observations in time order. Points that a later correction replaced are left out.
    public let samples: [Sample]

    public init(plan: MeasurementPlan, dataPoints: [DataPoint]) {
        self.plan = plan
        let replaced = Set(dataPoints.compactMap(\.correctsID))
        samples =
            dataPoints
            .filter { $0.planID == plan.id && !replaced.contains($0.id) }
            .compactMap { point -> Sample? in
                guard let value = point.chartValue(for: plan) else { return nil }
                return Sample(id: point.id, date: point.observedAt, value: value)
            }
            .sorted { $0.date < $1.date }
    }

    public var target: Double? { plan.targetValue }
    public var first: Sample? { samples.first }
    public var latest: Sample? { samples.last }

    /// The mean of the three most recent observations, or nil with fewer than three.
    public var recentAverage: Double? {
        guard samples.count >= 3 else { return nil }
        let recent = samples.suffix(3)
        return recent.reduce(0) { $0 + $1.value } / Double(recent.count)
    }

    /// The recent average as a fraction of the target (1 means the target is met).
    public var recentFraction: Double? {
        guard let recentAverage, let target, target > 0 else { return nil }
        return recentAverage / target
    }

    /// Least-squares slope in value units per week, or nil with fewer than three observations.
    public var trendPerWeek: Double? {
        guard samples.count >= 3, let start = samples.first?.date else { return nil }
        let week: Double = 7 * 24 * 3600
        let xs = samples.map { $0.date.timeIntervalSince(start) / week }
        let ys = samples.map(\.value)
        let n = Double(samples.count)
        let meanX = xs.reduce(0, +) / n
        let meanY = ys.reduce(0, +) / n
        let denominator = xs.reduce(0) { $0 + ($1 - meanX) * ($1 - meanX) }
        guard denominator > 0 else { return nil }
        let numerator = zip(xs, ys).reduce(0) { $0 + ($1.0 - meanX) * ($1.1 - meanY) }
        return numerator / denominator
    }

    /// Two end points of the trend line for plotting, or nil when there is no trend.
    public var trendLine: [Sample]? {
        guard let slope = trendPerWeek, let start = samples.first, let end = samples.last
        else { return nil }
        let week: Double = 7 * 24 * 3600
        let n = Double(samples.count)
        let xs = samples.map { $0.date.timeIntervalSince(start.date) / week }
        let meanX = xs.reduce(0, +) / n
        let meanY = samples.map(\.value).reduce(0, +) / n
        let intercept = meanY - slope * meanX
        func at(_ sample: Sample) -> Sample {
            let x = sample.date.timeIntervalSince(start.date) / week
            return Sample(id: sample.id, date: sample.date, value: intercept + slope * x)
        }
        return [at(start), at(end)]
    }

    /// Prototype suggestion for the SRS "Sufficient" question. Nil when there is too little data
    /// or no numeric target. Yes when the recent average is within 80% of the target, or within
    /// 50% and still improving.
    public var suggestedSufficient: Bool? {
        guard plan.type != .latency, let fraction = recentFraction else { return nil }
        if fraction >= 0.8 { return true }
        if fraction >= 0.5, let trend = trendPerWeek, trend > 0 { return true }
        return false
    }
}
