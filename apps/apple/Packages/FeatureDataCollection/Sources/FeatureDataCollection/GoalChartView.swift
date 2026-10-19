import Charts
import CoreModels
import DesignSystem
import SwiftUI

/// A goal's data over time: points and line, the target as a rule, and a dashed trend line.
public struct GoalChartView: View {
    private let progress: GoalProgress

    public init(progress: GoalProgress) {
        self.progress = progress
    }

    private var yDomain: ClosedRange<Double> {
        let values = progress.samples.map(\.value) + [progress.target ?? 0]
        let top = max(values.max() ?? 1, 1)
        return 0...(top * 1.15)
    }

    public var body: some View {
        if progress.samples.isEmpty {
            ContentUnavailableView(
                "No data yet", systemImage: "chart.xyaxis.line",
                description: Text("Record a session to start the graph."))
        } else {
            Chart {
                ForEach(progress.samples) { sample in
                    LineMark(
                        x: .value("Date", sample.date), y: .value("Result", sample.value),
                        series: .value("Series", "Data")
                    )
                    .foregroundStyle(Theme.chartData)
                    PointMark(x: .value("Date", sample.date), y: .value("Result", sample.value))
                        .foregroundStyle(Theme.chartData)
                }
                if let target = progress.target {
                    RuleMark(y: .value("Target", target))
                        .foregroundStyle(Theme.chartTarget)
                        .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [6, 4]))
                        .annotation(position: .top, alignment: .leading) {
                            Text("Target \(ValueFormat.string(target, for: progress.plan))")
                                .font(.caption)
                                .foregroundStyle(Theme.chartTarget)
                        }
                }
                if let trend = progress.trendLine {
                    ForEach(trend) { end in
                        LineMark(
                            x: .value("Date", end.date), y: .value("Result", end.value),
                            series: .value("Series", "Trend")
                        )
                        .foregroundStyle(Theme.chartTrend)
                        .lineStyle(StrokeStyle(lineWidth: 2, dash: [2, 3]))
                    }
                }
            }
            .chartYScale(domain: yDomain)
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                    AxisGridLine()
                    AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                }
            }
            .frame(minHeight: 200)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Progress graph")
            .accessibilityValue(summary)
        }
    }

    private var summary: String {
        guard let latest = progress.latest else { return "No data" }
        var parts = [
            "\(progress.samples.count) sessions",
            "latest \(ValueFormat.string(latest.value, for: progress.plan))",
        ]
        if let target = progress.target {
            parts.append("target \(ValueFormat.string(target, for: progress.plan))")
        }
        return parts.joined(separator: ", ")
    }
}
