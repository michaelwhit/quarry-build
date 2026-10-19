import DesignSystem
import SwiftUI

/// Colors and sizes for the session screens, from the Midnight theme.
enum SessionStyle {
    static let good = Theme.good
    static let bad = Theme.bad
    static let accent = Theme.primary
    static let muted = Theme.muted
    static let surface = Theme.surface
    static let minTarget: CGFloat = 60
    static let bigTarget: CGFloat = 96
}

/// A filled, full-width pad with the theme's on-color text, so contrast holds in dark and light.
struct FilledPadStyle: ButtonStyle {
    var color: Color
    var minHeight: CGFloat
    var fillWidth = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 14)
            .frame(maxWidth: fillWidth ? .infinity : nil, minHeight: minHeight)
            .foregroundStyle(Theme.onPrimary)
            .background(
                color.opacity(configuration.isPressed ? 0.7 : 1),
                in: RoundedRectangle(cornerRadius: 16))
    }
}
