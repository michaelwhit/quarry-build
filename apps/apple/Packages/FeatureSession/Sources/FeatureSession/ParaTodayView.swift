import DesignSystem
import SwiftUI

/// The first screen for a paraprofessional: the goals they take data on, as big cards, and one
/// button to start a session. Nothing else: no search, no counts, no other students.
public struct ParaTodayView: View {
    let cards: [ParaGoalCard]
    let resumeAvailable: Bool
    let onStart: () -> Void
    let onResume: () -> Void

    public init(
        cards: [ParaGoalCard], resumeAvailable: Bool, onStart: @escaping () -> Void,
        onResume: @escaping () -> Void
    ) {
        self.cards = cards
        self.resumeAvailable = resumeAvailable
        self.onStart = onStart
        self.onResume = onResume
    }

    public var body: some View {
        List {
            if resumeAvailable {
                Section {
                    Button(action: onResume) {
                        Label(
                            "Resume the session you were in",
                            systemImage: "arrow.clockwise.circle.fill"
                        )
                        .font(.headline)
                        .frame(minHeight: SessionStyle.minTarget, alignment: .leading)
                    }
                    .accessibilityIdentifier("para.resume")
                }
            }
            Section {
                if cards.isEmpty {
                    Text("No goals on your list yet. Ask your case manager.")
                        .foregroundStyle(SessionStyle.muted)
                        .accessibilityIdentifier("para.empty")
                }
                ForEach(cards) { card in
                    ParaGoalCardView(card: card)
                }
            }
            if cards.contains(where: \.canStart) {
                Section {
                    Button(action: onStart) {
                        Label("Start a session", systemImage: "play.circle.fill")
                            .font(.headline)
                            .frame(maxWidth: .infinity, minHeight: SessionStyle.minTarget)
                    }
                    .buttonStyle(
                        FilledPadStyle(color: SessionStyle.accent, minHeight: SessionStyle.minTarget)
                    )
                    .accessibilityIdentifier("para.start")
                }
            }
        }
        .themedList()
        .navigationTitle("Your goals today")
    }
}

/// One goal: the first name, the short goal, and a button for the full text and scoring note.
struct ParaGoalCardView: View {
    let card: ParaGoalCard
    @State private var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(card.studentName).font(.title3.weight(.semibold))
            Text(open ? card.fullText : card.shortText)
            if open, let note = card.scoringNote {
                VStack(alignment: .leading, spacing: 2) {
                    Text("How to score this goal")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(SessionStyle.muted)
                    Text(note)
                }
            }
            if card.hasMore {
                Button(open ? "Show less" : "Show full goal") { open.toggle() }
                    .buttonStyle(.borderless)
                    .frame(minHeight: Spacing.minTapTarget, alignment: .leading)
                    .accessibilityIdentifier("para.more")
            }
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .contain)
    }
}
