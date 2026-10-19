import CoreModels
import DesignSystem
import Persistence
import SwiftUI

/// Sign-in. Real builds will use the district's Google account. Until then the demo
/// builds offer a picker of fake staff, compiled in only when DEMO_IDENTITY is set. A release
/// build has no way in, and CI fails if the demo identity ever ships (CONTRIBUTING.md).
struct SignInView: View {
    var body: some View {
        #if DEMO_IDENTITY
            DemoSignInView()
        #else
            ContentUnavailableView(
                "Sign in with your district account", systemImage: "lock",
                description: Text("Google sign-in is not available in this build yet."))
        #endif
    }
}

#if DEMO_IDENTITY
    /// IEP_DEMO_IDENTITY_MARKER: this string must never appear in a release binary.
    struct DemoSignInView: View {
        @Environment(PrototypeStore.self) private var store

        var body: some View {
            NavigationStack {
                List {
                    Section {
                        Text(
                            "Demo build with fake students. Pick a fake staff member to see what each role can do."
                        )
                        .foregroundStyle(.secondary)
                    }
                    Section("Sign in as") {
                        ForEach(store.demoStaff) { staff in
                            Button {
                                store.signIn(as: staff)
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(staff.displayName).font(.headline)
                                    Text(staff.role.title).font(.footnote).foregroundStyle(.secondary)
                                }
                            }
                            .buttonStyle(.plain)
                            .accessibilityElement(children: .combine)
                            .accessibilityIdentifier(AccessibilityID.signInRow(staff.id))
                        }
                    }
                }
                .accessibilityIdentifier(AccessibilityID.signInList)
                .themedList()
                .navigationTitle(AppInfo.name)
            }
        }
    }
#endif

#if DEMO_IDENTITY
    enum DemoSignIn {
        @MainActor
        static func openAsDirector(_ store: PrototypeStore) {
            guard store.currentStaff == nil,
                let director = store.demoStaff.first(where: { $0.role == .spedDirector })
            else { return }
            store.signIn(as: director)
        }
    }
#endif
