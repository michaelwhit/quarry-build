import SwiftUI

#if canImport(AppKit)
    import AppKit
#elseif canImport(UIKit)
    import UIKit
#endif

/// The "Midnight" palette: near-black screens, dark rounded cards, and bright accents (mint target,
/// blue data, gold trend). Dark is the primary look; light is derived from it (same hues, lifted
/// backgrounds, darkened accents so text keeps its contrast). Colors adapt to the system
/// appearance. Status is never color alone: chips and rows always carry words and icons too.
public enum Theme {
    public static let background = adaptive(dark: 0x000000, light: 0xF3F6FB)
    public static let surface = adaptive(dark: 0x1C1C1E, light: 0xFFFFFF)
    public static let line = adaptive(dark: 0x2C2C2E, light: 0xD7DFEC)
    public static let ink = adaptive(dark: 0xE8EDF7, light: 0x0E1420)
    public static let muted = adaptive(dark: 0x9FB0CC, light: 0x4A5B78)
    public static let primary = adaptive(dark: 0x5B8CFF, light: 0x2F5FD9)
    public static let onPrimary = adaptive(dark: 0x0E1420, light: 0xFFFFFF)
    public static let accent = adaptive(dark: 0x7EE0C3, light: 0x0F7A62)
    public static let warn = adaptive(dark: 0xFFB454, light: 0x8A4705)
    public static let warnFill = adaptive(dark: 0x3A2A12, light: 0xFCEBD3)
    public static let good = adaptive(dark: 0x4FD1A1, light: 0x17694A)
    public static let goodFill = adaptive(dark: 0x12352B, light: 0xDDF3E8)
    public static let bad = adaptive(dark: 0xFF7B7B, light: 0xB3372F)
    public static let badFill = adaptive(dark: 0x3D1B1F, light: 0xFBE0E0)

    /// Chart colors, used by every graph so a goal reads the same everywhere:
    /// mint dashed target, blue data line and points, gold dotted trend.
    public static let chartTarget = accent
    public static let chartData = primary
    public static let chartTrend = warn

    private static func adaptive(dark: UInt32, light: UInt32) -> Color {
        #if canImport(AppKit)
            Color(
                nsColor: NSColor(name: nil) { appearance in
                    let isDark =
                        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
                    return NSColor(hex: isDark ? dark : light)
                })
        #else
            Color(
                uiColor: UIColor { traits in
                    UIColor(hex: traits.userInterfaceStyle == .dark ? dark : light)
                })
        #endif
    }
}

#if canImport(AppKit)
    extension NSColor {
        fileprivate convenience init(hex: UInt32) {
            self.init(
                srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
                green: CGFloat((hex >> 8) & 0xFF) / 255,
                blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
        }
    }
#else
    extension UIColor {
        fileprivate convenience init(hex: UInt32) {
            self.init(
                red: CGFloat((hex >> 16) & 0xFF) / 255,
                green: CGFloat((hex >> 8) & 0xFF) / 255,
                blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
        }
    }
#endif

/// A card: raised surface, hairline border, rounded corners.
public struct CardModifier: ViewModifier {
    public init() {}
    public func body(content: Content) -> some View {
        content
            .padding(Spacing.medium)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.line, lineWidth: 1))
    }
}

extension View {
    public func card() -> some View { modifier(CardModifier()) }

    /// A List that follows the theme: the app background behind rounded dark rows, like the goal
    /// screen. Use this for every list screen so none builds its own look.
    public func themedList() -> some View {
        self
            .scrollContentBackground(.hidden)
            .themedScreen()
    }

    /// Fills the screen with the app background and tints controls with the primary color.
    public func themedScreen() -> some View {
        self
            .tint(Theme.primary)
            .background(Theme.background.ignoresSafeArea())
    }
}

/// A tiny line graph for rows and cards: the series scaled to its own range, an optional target
/// rule, ends marked. Decorative; the row's text carries the numbers for VoiceOver.
public struct Sparkline: View {
    private let values: [Double]
    private let target: Double?
    private let color: Color

    public init(values: [Double], target: Double? = nil, color: Color = Theme.primary) {
        self.values = values
        self.target = target
        self.color = color
    }

    public var body: some View {
        GeometryReader { geo in
            let all = values + (target.map { [$0] } ?? [])
            let low = min(all.min() ?? 0, 0)
            let high = max(all.max() ?? 1, low + 1)
            let h = geo.size.height
            let w = geo.size.width
            let y: (Double) -> CGFloat = { v in h - CGFloat((v - low) / (high - low)) * (h - 4) - 2 }
            ZStack {
                if let target {
                    Path { p in
                        p.move(to: CGPoint(x: 0, y: y(target)))
                        p.addLine(to: CGPoint(x: w, y: y(target)))
                    }
                    .stroke(Theme.chartTarget, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                }
                if values.count > 1 {
                    Path { p in
                        for (i, v) in values.enumerated() {
                            let pt = CGPoint(
                                x: w * CGFloat(i) / CGFloat(values.count - 1), y: y(v))
                            i == 0 ? p.move(to: pt) : p.addLine(to: pt)
                        }
                    }
                    .stroke(color, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                    Circle().fill(color).frame(width: 7, height: 7)
                        .position(x: w, y: y(values.last ?? 0))
                }
            }
        }
        .accessibilityHidden(true)
    }
}
