import DesignSystem
import FeatureStudents
import Persistence
import SwiftUI

/// What a Home tile does. A tile for a feature that is not built says "Planned" and opens nothing.
private struct HomeTile: Identifiable {
    let title: String
    let subtitle: String
    let systemImage: String
    /// Nil means the feature is not built yet.
    let destination: AppDestination?
    var id: String { title }
}

/// The first screen: the caseload in numbers, then a tile for everything the product does.
/// Numbers come from `CaseloadSummary`, the same source as the Caseload summary they open.
struct HomeView: View {
    @Environment(PrototypeStore.self) private var store
    let screens: ShellScreens
    /// Today needs someone signed in who may record data.
    let todayAvailable: Bool
    let open: (AppDestination) -> Void

    /// Every tile the product has; `tiles` keeps the ones this role may use. A tile the role may
    /// not use is left out, not greyed. A tile for a feature not built yet says "Planned".
    private var allTiles: [(tile: HomeTile, allowed: Bool)] {
        let role = store.roleView
        return [
            (
                HomeTile(
                    title: "Today", subtitle: "Start a session", systemImage: "checklist",
                    destination: todayAvailable ? .today : nil), role.showsToday
            ),
            (
                HomeTile(
                    title: "Track progress", subtitle: "Pick a student and goal",
                    systemImage: "scope", destination: .caseload), role.showsCaseload
            ),
            (
                HomeTile(
                    title: role.caseloadTitle,
                    subtitle: role.caseloadTitle == "Caseload" ? "Your students" : "Students you serve",
                    systemImage: "person.2", destination: .caseload), role.showsCaseload
            ),
            (
                HomeTile(
                    title: "Goal library", subtitle: "Find and add goals",
                    systemImage: "books.vertical",
                    destination: screens.libraries == nil ? nil : .libraries), role.showsLibraries
            ),
            (
                HomeTile(
                    title: "Accommodations",
                    subtitle: "Find supports, set where, how often, how long",
                    systemImage: "hand.raised",
                    destination: screens.libraries == nil ? nil : .libraries), role.showsLibraries
            ),
            (
                HomeTile(
                    title: "Draft from evaluation",
                    subtitle: "Goals and accommodations from test results",
                    systemImage: "doc.text.magnifyingglass", destination: .evaluation),
                role.canUseAI
            ),
            (
                HomeTile(
                    title: "Present levels", subtitle: "Draft the present-levels section",
                    systemImage: "text.alignleft", destination: nil), role.canDraft
            ),
            (
                HomeTile(
                    title: "Goal graphs", subtitle: "See progress over time",
                    systemImage: "chart.line.uptrend.xyaxis", destination: .caseloadSummary),
                role.showsGraphs
            ),
            (
                HomeTile(
                    title: "Staff and roles", subtitle: "Assign roles and caseloads",
                    systemImage: "person.badge.key", destination: nil), role.canManageStaff
            ),
            (
                HomeTile(
                    title: "Access review", subtitle: "See who can open what",
                    systemImage: "checklist.checked", destination: nil), role.canReviewAccess
            ),
        ]
    }

    private var tiles: [HomeTile] {
        allTiles.filter(\.allowed).map(\.tile)
    }

    var body: some View {
        let summary = CaseloadSummary(store: store)
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.large) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(store.dataset.tenant.name.replacingOccurrences(of: " (synthetic)", with: ""))
                        .font(.caption.weight(.bold)).foregroundStyle(Theme.accent)
                    Text("Home").font(.largeTitle.weight(.heavy)).foregroundStyle(Theme.ink)
                }
                numbers(summary)
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 160), spacing: Spacing.medium)],
                    spacing: Spacing.medium
                ) {
                    ForEach(tiles) { tile in
                        tileView(tile)
                    }
                }
            }
            .padding(Spacing.large)
            .frame(maxWidth: 900, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .themedScreen()
        .navigationTitle("Home")
        #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
        #endif
    }

    /// Each part opens the Caseload summary, where the same count is shown.
    private func numbers(_ summary: CaseloadSummary) -> some View {
        Button {
            open(.caseloadSummary)
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                Text("\(summary.students) students · \(summary.goals) goals")
                    .font(.headline).foregroundStyle(Theme.ink)
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) { chips(summary) }
                    VStack(alignment: .leading, spacing: 8) { chips(summary) }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .card()
            .accessibilityElement(children: .combine)
        }
        .buttonStyle(.plain)
        .accessibilityHint("Opens the caseload summary")
        .accessibilityIdentifier(AccessibilityID.homeNumbers)
    }

    @ViewBuilder
    private func chips(_ summary: CaseloadSummary) -> some View {
        StatusChip("\(summary.onTrack) on track", systemImage: "arrow.up.right", tone: .good)
        StatusChip(
            "\(summary.needsLook) need a look", systemImage: "exclamationmark.triangle",
            tone: .caution)
        StatusChip(
            "\(summary.approved) of \(summary.goals) reports approved",
            systemImage: "checkmark.seal", tone: .neutral)
    }

    @ViewBuilder
    private func tileView(_ tile: HomeTile) -> some View {
        if let destination = tile.destination {
            Button {
                open(destination)
            } label: {
                tileBody(tile, planned: false)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier(AccessibilityID.homeTile(tile.title))
        } else {
            tileBody(tile, planned: true)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(tile.title). \(tile.subtitle). Planned, not available yet.")
                .accessibilityIdentifier(AccessibilityID.homeTile(tile.title))
        }
    }

    private func tileBody(_ tile: HomeTile, planned: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: tile.systemImage)
                    .font(.title2)
                    .foregroundStyle(planned ? Theme.muted : Theme.primary)
                Spacer()
                if planned {
                    Text("Planned").font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
                }
            }
            Text(tile.title).font(.headline)
                .foregroundStyle(planned ? Theme.muted : Theme.ink)
            Text(tile.subtitle).font(.footnote).foregroundStyle(Theme.muted)
                .multilineTextAlignment(.leading)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, minHeight: 112, alignment: .topLeading)
        .card()
        .opacity(planned ? 0.75 : 1)
        .accessibilityElement(children: .combine)
    }
}
