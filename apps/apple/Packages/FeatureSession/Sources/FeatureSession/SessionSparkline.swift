import DesignSystem
import SwiftUI

/// The last sessions as a line, with an optional aim rule. The same series the goal graph plots.
/// Decorative: the text beside it carries the numbers for VoiceOver.
struct SessionSparkline: View {
    let values: [Double]
    var target: Double?

    var body: some View {
        GeometryReader { geo in
            let all = values + (target.map { [$0] } ?? [])
            let low = min(all.min() ?? 0, 0)
            let high = max(all.max() ?? 1, low + 1)
            let height = geo.size.height
            let width = geo.size.width
            ZStack {
                if let target {
                    Path { path in
                        let y = yPosition(target, low: low, high: high, height: height)
                        path.move(to: CGPoint(x: 0, y: y))
                        path.addLine(to: CGPoint(x: width, y: y))
                    }
                    .stroke(Theme.chartTarget, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                }
                if values.count > 1 {
                    Path { path in
                        for (i, value) in values.enumerated() {
                            let x = width * CGFloat(i) / CGFloat(values.count - 1)
                            let point = CGPoint(
                                x: x, y: yPosition(value, low: low, high: high, height: height))
                            if i == 0 { path.move(to: point) } else { path.addLine(to: point) }
                        }
                    }
                    .stroke(
                        Theme.primary,
                        style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                }
                if let last = values.last {
                    Circle().fill(Theme.primary).frame(width: 8, height: 8)
                        .position(
                            x: values.count > 1 ? width : width / 2,
                            y: yPosition(last, low: low, high: high, height: height))
                }
            }
        }
        .accessibilityHidden(true)
    }

    private func yPosition(_ value: Double, low: Double, high: Double, height: CGFloat) -> CGFloat {
        height - CGFloat((value - low) / (high - low)) * (height - 6) - 3
    }
}
