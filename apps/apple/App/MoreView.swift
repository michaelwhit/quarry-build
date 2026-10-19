import DesignSystem
import Persistence
import SwiftUI

/// The More tab: who is signed in, demo data reset, sign out. The account lives here, not in the
/// top bar, so the TEST DATA badge never covers it.
struct MoreView: View {
    @Environment(PrototypeStore.self) private var store
    @State private var confirmReset = false

    var body: some View {
        List {
            if let staff = store.currentStaff {
                Section("Signed in") {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(staff.displayName).font(.headline)
                        Text(staff.role.title).font(.subheadline).foregroundStyle(Theme.muted)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier(AccessibilityID.accountMenu)
                }
            }
            Section {
                Button("Reset demo data", role: .destructive) { confirmReset = true }
                    .frame(minHeight: Spacing.minTapTarget, alignment: .leading)
                    .accessibilityIdentifier(AccessibilityID.resetDemoData)
                Button("Sign out") { store.signOut() }
                    .frame(minHeight: Spacing.minTapTarget, alignment: .leading)
                    .accessibilityIdentifier(AccessibilityID.signOut)
            }
        }
        .scrollContentBackground(.hidden)
        .themedScreen()
        .navigationTitle("More")
        .confirmationDialog(
            "Delete the data you recorded and the progress entries you approved?",
            isPresented: $confirmReset, titleVisibility: .visible
        ) {
            Button("Reset demo data", role: .destructive) { store.resetLocalData() }
                .accessibilityIdentifier(AccessibilityID.resetConfirm)
        }
    }
}
