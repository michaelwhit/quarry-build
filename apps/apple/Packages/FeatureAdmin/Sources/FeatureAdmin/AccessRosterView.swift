import DesignSystem
import SwiftUI

/// The plain list of who may see student records, with a save-as-CSV button. Director only.
public struct AccessRosterView: View {
    let model: StaffAdminModel

    public init(model: StaffAdminModel) {
        self.model = model
    }

    public var body: some View {
        let rows = model.accessRoster()
        List {
            Section {
                ForEach(rows, id: \.name) { row in
                    VStack(alignment: .leading) {
                        Text(row.name)
                        Text("\(row.role) · \(row.position)").font(.footnote).foregroundStyle(Theme.muted)
                    }
                    .accessibilityElement(children: .combine)
                }
            } footer: {
                Text(StaffRolesText.rosterNote)
            }
            if !rows.isEmpty {
                ShareLink(item: AccessRosterRow.csv(rows)) {
                    Label("Save as CSV", systemImage: "square.and.arrow.up")
                }
            }
        }
        .themedScreen()
        .navigationTitle(StaffRolesText.rosterTitle)
    }
}
