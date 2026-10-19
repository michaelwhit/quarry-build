import DesignSystem
import StarterLibrary
import SwiftUI

/// The read-only preview of a library goal: the wording with slots shown as bracketed words, how it
/// will be measured, when it counts as met, and where it came from. Attach is "Planned" until the
/// goal fields it writes exist.
struct GoalPreviewView: View {
    let goal: GoalTemplate
    let index: LibraryIndex

    @State private var filling = false

    var body: some View {
        if filling {
            GoalFillInView(goal: goal, onBack: { filling = false })
        } else {
            details
        }
    }

    private var details: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.medium) {
                Text(goal.title).font(.title2.bold()).foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
                Text(GoalTemplateText.preview(goal.templateText))
                    .font(.body).foregroundStyle(Theme.ink)
                    .card()
                    .accessibilityIdentifier("library.preview.text")
                    .accessibilityLabel("Goal wording: \(GoalTemplateText.preview(goal.templateText))")

                section("Parts of the goal") {
                    row("Condition", GoalTemplateText.preview(goal.conditionText))
                    row("Performance", GoalTemplateText.preview(goal.behaviorText))
                    row("Mastery", LibraryText.masteryLine(goal.mastery))
                }
                section("How it is measured") {
                    row("Method", LibraryLabels.method(goal.measurementPlanTemplate.method))
                    if let unit = goal.measurementPlanTemplate.unit { row("Counts", unit) }
                    if let trials = goal.measurementPlanTemplate.trialsPerSession {
                        row("Tries per session", "\(trials)")
                    }
                    if let guidance = goal.baselineGuidance { row("Before you write it", guidance) }
                }
                if !goal.objectiveLadder.isEmpty {
                    section("Steps toward it") {
                        ForEach(Array(goal.objectiveLadder.enumerated()), id: \.offset) { i, step in
                            row("Step \(i + 1)", step)
                        }
                    }
                }
                section("Details") {
                    if !goal.gradeBands.isEmpty { row("For grades", goal.gradeBands.joined(separator: ", ")) }
                    row("Usually written by", LibraryLabels.discipline(goal.discipline))
                    if let node = goal.skillIds.first { row("Skill", index.path(toNode: node)) }
                    if let addresses = goal.iepAddresses, !addresses.isEmpty {
                        row("Goal addresses", addresses.joined(separator: ", "))
                    }
                    if !goal.standardRefs.isEmpty {
                        row("Standards", goal.standardRefs.joined(separator: ", "))
                    }
                    row("Source", LibraryText.provenanceLine(goal.provenance))
                }
                if goal.requiresFbaBip == true {
                    Label(
                        "This goal is about a replacement behavior. Confirm the behavior assessment and plan exist before using it.",
                        systemImage: "exclamationmark.triangle.fill"
                    )
                    .font(.callout).foregroundStyle(Theme.warn)
                    .card()
                }
                let related = goal.relatedAccommodationIds.compactMap(index.accommodation(id:))
                if !related.isEmpty {
                    section("Supports that go with it") {
                        ForEach(related) { Text($0.title).foregroundStyle(Theme.ink) }
                    }
                }
                Button {
                    filling = true
                } label: {
                    Text("Fill in this goal").font(.headline)
                        .frame(maxWidth: .infinity, minHeight: Spacing.minTapTarget)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("library.preview.fillIn")
                HStack {
                    StatusChip("Planned", systemImage: "clock", tone: .neutral)
                    Text("Adding this goal to a student's plan is not built yet.")
                        .font(.callout).foregroundStyle(Theme.muted)
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("library.preview.attachPlanned")
            }
            .padding(Spacing.medium)
        }
        .themedScreen()
    }

    @ViewBuilder
    private func section<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Spacing.small) {
            Text(title).font(.headline).foregroundStyle(Theme.ink).accessibilityAddTraits(.isHeader)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }

    private func row(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption).foregroundStyle(Theme.muted)
            Text(value).foregroundStyle(Theme.ink)
        }
        .accessibilityElement(children: .combine)
    }
}
