import DesignSystem
import SwiftUI

/// One page a staff member reads and agrees to before seeing any student. Agreeing is the only way
/// forward; declining hands control back to the caller (for example to sign out).
public struct AcknowledgmentView: View {
    private let onAgree: (AcknowledgmentRecord) -> Void
    private let onDecline: () -> Void
    private let now: () -> Date

    @State private var agreed = false

    public init(
        now: @escaping () -> Date = Date.init, onAgree: @escaping (AcknowledgmentRecord) -> Void,
        onDecline: @escaping () -> Void
    ) {
        self.now = now
        self.onAgree = onAgree
        self.onDecline = onDecline
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.medium) {
                Text(AcknowledgmentText.title).font(.largeTitle.weight(.bold))
                if AcknowledgmentText.isProposed {
                    Text(AcknowledgmentText.proposedNotice)
                        .font(.footnote.weight(.semibold)).foregroundStyle(Theme.warn)
                        .accessibilityIdentifier("ack-proposed")
                }
                ForEach(Array(AcknowledgmentText.points.enumerated()), id: \.offset) { _, point in
                    Label {
                        Text(point)
                    } icon: {
                        Image(systemName: "lock.shield").foregroundStyle(Theme.accent)
                    }
                }
                Toggle(AcknowledgmentText.checkboxLabel, isOn: $agreed)
                    .accessibilityIdentifier("ack-agree-toggle")
                    .frame(minHeight: Spacing.minTapTarget)
                Button("Continue") {
                    onAgree(AcknowledgmentRecord(acknowledgedAt: now()))
                }
                .buttonStyle(.borderedProminent)
                .disabled(!agreed)
                .frame(minHeight: Spacing.minTapTarget)
                .accessibilityIdentifier("ack-continue")
                Button("I do not agree", role: .cancel, action: onDecline)
                    .frame(minHeight: Spacing.minTapTarget)
                    .accessibilityIdentifier("ack-decline")
            }
            .padding(Spacing.medium)
            .card()
            .padding(Spacing.medium)
        }
        .themedScreen()
    }
}
