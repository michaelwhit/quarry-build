import DesignSystem
import StarterLibrary
import SwiftUI

/// Goal and accommodation library browser. It owns no navigation: the shell puts it in
/// a tab or sidebar detail, and it opens previews itself (a sheet on iPhone, a third pane on Mac),
/// so it needs no routes from the shell.
public struct LibraryBrowserView: View {
    public enum Section: String, CaseIterable, Identifiable, Sendable {
        case goals = "Goals"
        case accommodations = "Accommodations"
        public var id: String { rawValue }
    }

    private let index: LibraryIndex
    @State private var section: Section
    @State private var query = ""
    @State private var filters = GoalFilters()
    @State private var categories: Set<String> = []
    @State private var selectedGoalID: String?
    @State private var selectedAccommodationID: String?
    @State private var showTree = false

    public init(index: LibraryIndex, startingAt section: Section = .goals) {
        self.index = index
        self._section = State(initialValue: section)
    }

    private var goals: [GoalTemplate] { index.goals(matching: query, filters: filters) }
    private var accommodations: [AccommodationTemplate] {
        index.accommodations(matching: query, categories: categories)
    }

    public var body: some View {
        content
            .themedScreen()
            .navigationTitle("Libraries")
    }

    // MARK: Layout

    @ViewBuilder
    private var content: some View {
        #if os(macOS)
            HSplitView {
                if section == .goals {
                    taxonomyList.frame(minWidth: 180, idealWidth: 220, maxWidth: 280)
                }
                VStack(spacing: 0) {
                    header
                    resultsList
                }
                .frame(minWidth: 300)
                preview.frame(minWidth: 320)
            }
        #else
            VStack(spacing: 0) {
                header
                resultsList
            }
            .sheet(isPresented: sheetBinding) {
                NavigationStack {
                    preview
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button("Done") {
                                    selectedGoalID = nil
                                    selectedAccommodationID = nil
                                }
                            }
                        }
                }
            }
            .sheet(isPresented: $showTree) {
                NavigationStack {
                    taxonomyList
                        .navigationTitle("Skills")
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button("Done") { showTree = false }
                            }
                        }
                }
            }
        #endif
    }

    private var sheetBinding: Binding<Bool> {
        Binding(
            get: { selectedGoalID != nil || selectedAccommodationID != nil },
            set: { if !$0 { selectedGoalID = nil; selectedAccommodationID = nil } })
    }

    // MARK: Header: section picker, search, chips

    private var header: some View {
        VStack(alignment: .leading, spacing: Spacing.small) {
            Picker("Library", selection: $section) {
                ForEach(Section.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("library.section")

            TextField("Search, for example phonics or fine motor", text: $query)
                .textFieldStyle(.roundedBorder)
                .frame(minHeight: Spacing.minTapTarget)
                .accessibilityIdentifier("library.search")
                #if os(iOS)
                    .textInputAutocapitalization(.never)
                #endif
                .autocorrectionDisabled()

            if section == .goals { goalChips } else { accommodationChips }

            Text(countLine)
                .font(.footnote).foregroundStyle(Theme.muted)
                .accessibilityIdentifier("library.count")
        }
        .padding(Spacing.medium)
    }

    private var countLine: String {
        let n = section == .goals ? goals.count : accommodations.count
        let noun = section == .goals ? "goal" : "accommodation"
        return n == 1 ? "1 \(noun)" : "\(n) \(noun)s"
    }

    private var goalChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.small) {
                #if os(iOS)
                    chip(
                        filters.taxonomyNodeId.flatMap { index.node($0)?.name } ?? "All skills",
                        on: filters.taxonomyNodeId != nil, id: "library.chip.skills"
                    ) { showTree = true }
                #endif
                ForEach(index.availableAreas, id: \.self) { area in
                    chip(LibraryIndex.areaLabel(area), on: filters.areas.contains(area), id: "library.chip.area.\(area)") {
                        toggle(&filters.areas, area)
                    }
                }
                ForEach(index.availableGradeBands, id: \.self) { band in
                    chip("Grades \(band)", on: filters.gradeBands.contains(band), id: "library.chip.grade.\(band)") {
                        toggle(&filters.gradeBands, band)
                    }
                }
                ForEach(index.availableDisciplines, id: \.self) { d in
                    chip(LibraryLabels.discipline(d), on: filters.disciplines.contains(d), id: "library.chip.discipline.\(d)") {
                        toggle(&filters.disciplines, d)
                    }
                }
                if !filters.isEmpty {
                    Button("Clear filters") { filters = GoalFilters() }
                        .frame(minHeight: Spacing.minTapTarget)
                        .accessibilityIdentifier("library.clearFilters")
                }
            }
        }
    }

    private var accommodationChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.small) {
                ForEach(index.accommodationCategories, id: \.self) { c in
                    chip(c, on: categories.contains(c), id: "library.chip.category.\(c)") {
                        toggle(&categories, c)
                    }
                }
                if !categories.isEmpty {
                    Button("Clear filters") { categories = [] }
                        .frame(minHeight: Spacing.minTapTarget)
                }
            }
        }
    }

    private func toggle(_ set: inout Set<String>, _ value: String) {
        if set.contains(value) { set.remove(value) } else { set.insert(value) }
    }

    private func chip(_ title: String, on: Bool, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(on ? .semibold : .regular))
                .padding(.horizontal, 12)
                .frame(minHeight: Spacing.minTapTarget)
                .background(on ? Theme.primary : Theme.surface, in: Capsule())
                .foregroundStyle(on ? Theme.onPrimary : Theme.ink)
                .overlay(Capsule().stroke(Theme.line, lineWidth: on ? 0 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
        .accessibilityLabel(title)
        .accessibilityValue(on ? "on" : "off")
        .accessibilityIdentifier(id)
    }

    // MARK: Results

    @ViewBuilder
    private var resultsList: some View {
        if section == .goals {
            let rows = goals
            if rows.isEmpty {
                emptyState
            } else {
                List(rows, selection: $selectedGoalID) { goal in
                    GoalRow(goal: goal, area: index.area(of: goal))
                        .tag(goal.id)
                        #if os(iOS)
                            .contentShape(Rectangle())
                            .onTapGesture { selectedGoalID = goal.id }
                        #endif
                        .accessibilityIdentifier("library.goal.\(goal.id)")
                }
                .listStyle(.plain)
                .accessibilityIdentifier("library.goalList")
            }
        } else {
            let rows = accommodations
            if rows.isEmpty {
                emptyState
            } else {
                List(rows, selection: $selectedAccommodationID) { item in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.title).font(.headline).foregroundStyle(Theme.ink)
                        Text(item.category).font(.caption).foregroundStyle(Theme.muted)
                    }
                    .frame(minHeight: Spacing.minTapTarget, alignment: .leading)
                    .tag(item.id)
                    #if os(iOS)
                        .contentShape(Rectangle())
                        .onTapGesture { selectedAccommodationID = item.id }
                    #endif
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("library.accommodation.\(item.id)")
                }
                .listStyle(.plain)
                .accessibilityIdentifier("library.accommodationList")
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: Spacing.small) {
            Text("Nothing matches").font(.headline).foregroundStyle(Theme.ink)
            Text("Try fewer words, or clear the filters.").foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("library.empty")
    }

    // MARK: Tree and preview

    private var taxonomyList: some View {
        List {
            Button {
                filters.taxonomyNodeId = nil
                #if os(iOS)
                    showTree = false
                #endif
            } label: {
                Text("All skills").foregroundStyle(Theme.ink)
                    .fontWeight(filters.taxonomyNodeId == nil ? .semibold : .regular)
            }
            .frame(minHeight: Spacing.minTapTarget)
            .accessibilityIdentifier("library.tree.all")
            ForEach(index.taxonomyRows()) { row in
                Button {
                    filters.taxonomyNodeId = row.node.id
                    #if os(iOS)
                        showTree = false
                    #endif
                } label: {
                    HStack {
                        Text(row.node.name)
                            .fontWeight(filters.taxonomyNodeId == row.node.id ? .semibold : .regular)
                            .foregroundStyle(Theme.ink)
                        Spacer()
                        Text("\(row.goalCount)").font(.caption).foregroundStyle(Theme.muted)
                    }
                    .padding(.leading, CGFloat(row.depth) * 14)
                }
                .frame(minHeight: Spacing.minTapTarget)
                .accessibilityLabel("\(row.node.name), \(row.goalCount) goals")
                .accessibilityIdentifier("library.tree.\(row.node.id)")
            }
        }
        .listStyle(.sidebar)
    }

    @ViewBuilder
    private var preview: some View {
        if let id = selectedGoalID, let goal = index.goal(id: id) {
            GoalPreviewView(goal: goal, index: index)
                .id(goal.id)  // a new selection starts a new view, never a half-filled form for the old goal
        } else if let id = selectedAccommodationID, let item = index.accommodation(id: id) {
            AccommodationPreviewView(item: item)
                .id(item.id)
        } else {
            Text("Pick an item to see it here.")
                .foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

private struct GoalRow: View {
    let goal: GoalTemplate
    let area: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(goal.title).font(.headline).foregroundStyle(Theme.ink)
            Text(GoalTemplateText.preview(goal.templateText))
                .font(.subheadline).foregroundStyle(Theme.muted).lineLimit(2)
            HStack(spacing: 6) {
                if let area { StatusChip(LibraryIndex.areaLabel(area)) }
                StatusChip("Grades " + goal.gradeBands.joined(separator: ", "))
            }
        }
        .frame(minHeight: Spacing.minTapTarget, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
