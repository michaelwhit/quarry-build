import SwiftUI

/// A small colored label such as "On track" or "Approved". Color is never the only signal: the
/// text always says what the chip means, and VoiceOver reads the text.
public struct StatusChip: View {
    public enum Tone: Sendable {
        case good, caution, neutral
    }

    private let text: String
    private let systemImage: String?
    private let tone: Tone

    public init(_ text: String, systemImage: String? = nil, tone: Tone = .neutral) {
        self.text = text
        self.systemImage = systemImage
        self.tone = tone
    }

    private var color: Color {
        switch tone {
        case .good: Theme.good
        case .caution: Theme.warn
        case .neutral: Theme.muted
        }
    }

    private var fill: Color {
        switch tone {
        case .good: Theme.goodFill
        case .caution: Theme.warnFill
        case .neutral: Theme.line.opacity(0.6)
        }
    }

    public var body: some View {
        HStack(spacing: 4) {
            if let systemImage {
                Image(systemName: systemImage).accessibilityHidden(true)
            }
            Text(text)
        }
        .font(.caption.weight(.semibold))
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .foregroundStyle(color)
        .background(fill, in: Capsule())
    }
}
