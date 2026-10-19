import CoreModels
import DesignSystem
import SwiftUI

/// The director's list of staff: search, filter chips, and one row per person.
public struct StaffListView: View {
    @Bindable var model: StaffAdminModel
    @State private var filter: StaffFilter = .all
    @State private var search = ""

    public init(model: StaffAdminModel) {
        self.model = model
    }

    private static let order: [StaffRole] = [.spedDirector, .caseManager, .relatedServiceProvider, .paraprofessional]

    private var rows: [StaffPerson] {
        model.people(matching: filter, search: search).sorted {
            let a = Self.order.firstIndex(of: $0.role) ?? Self.order.count
            let b = Self.order.firstIndex(of: $1.role) ?? Self.order.count
            return a != b ? a < b : $0.name < $1.name
        }
    }

    public var body: some View {
        List {
            Section {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(StaffFilter.allCases) { item in chip(item) }
                    }
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }
            if rows.isEmpty {
                Text(StaffRolesText.emptyStaff).foregroundStyle(Theme.muted)
            }
            ForEach(rows) { person in
                NavigationLink {
                    StaffDetailView(model: model, personID: person.id)
                } label: {
                    row(person)
                }
                .disabled(!person.isActive)
            }
            if model.isDirector {
                Section {
                    NavigationLink(StaffRolesText.rosterExport) { AccessRosterView(model: model) }
                    HStack {
                        Text("See access review")
                        Spacer()
                        Text(StaffRolesText.accessReviewPlanned).foregroundStyle(Theme.muted)
                    }
                }
            }
        }
        .searchable(text: $search, prompt: StaffRolesText.searchPrompt)
        .themedScreen()
        .navigationTitle(StaffRolesText.title)
    }

    private func chip(_ item: StaffFilter) -> some View {
        Button(item.label) { filter = item }
            .buttonStyle(.bordered)
            .tint(filter == item ? Theme.primary : Theme.muted)
            .accessibilityAddTraits(filter == item ? .isSelected : [])
    }

    private func row(_ person: StaffPerson) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(person.name).foregroundStyle(person.isActive ? Theme.ink : Theme.muted)
                Text(StaffRolesText.roleName(person.role))
                    .font(.caption).foregroundStyle(Theme.muted)
            }
            Text(
                person.isActive
                    ? "\(person.building) · \(model.detailLine(for: person))" : StaffRolesText.signedOut
            )
            .font(.footnote).foregroundStyle(Theme.muted)
        }
        .accessibilityElement(children: .combine)
    }
}
