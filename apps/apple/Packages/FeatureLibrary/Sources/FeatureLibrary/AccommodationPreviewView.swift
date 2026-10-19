import DesignSystem
import StarterLibrary
import SwiftUI

/// Read-only preview of a library accommodation or modification. The builder that sets where, how
/// often and how long is a later row (T3-20), so the suggested values show as text only.
struct AccommodationPreviewView: View {
    let item: AccommodationTemplate

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.medium) {
                Text(item.title).font(.title2.bold()).foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
                Text(item.description).foregroundStyle(Theme.ink).card()
                    .accessibilityIdentifier("library.preview.text")
                if item.kind == "modification", let warning = item.modificationWarning {
                    Label(warning, systemImage: "exclamationmark.triangle.fill")
                        .font(.callout).foregroundStyle(Theme.warn).card()
                }
                VStack(alignment: .leading, spacing: Spacing.small) {
                    Text("Suggested starting values").font(.headline).foregroundStyle(Theme.ink)
                        .accessibilityAddTraits(.isHeader)
                    row("Where", item.defaultLfd.location)
                    row("How often", item.defaultLfd.frequency)
                    row("How long each time", item.defaultLfd.durationPerOccurrence)
                    row("For how long", item.defaultLfd.duration)
                    Text("The team sets these for each student. Nothing is filled in for you.")
                        .font(.footnote).foregroundStyle(Theme.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .card()
                row("Kind", item.kind == "modification" ? "Modification" : "Accommodation")
                row("Category", item.category)
                row("Source", LibraryText.provenanceLine(item.provenance))
            }
            .padding(Spacing.medium)
        }
        .themedScreen()
    }

    @ViewBuilder
    private func row(_ label: String, _ value: String?) -> some View {
        if let value, !value.isEmpty {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.caption).foregroundStyle(Theme.muted)
                Text(value).foregroundStyle(Theme.ink)
            }
            .accessibilityElement(children: .combine)
        }
    }
}
