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

        private var director: Staff? {
            store.demoStaff.first { $0.role == .spedDirector }
        }

        var body: some View {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.large) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("GoalLine").font(.largeTitle.weight(.heavy)).foregroundStyle(Theme.ink)
                        Text("Practice build with made-up students. Pick who is signing in.")
                            .font(.subheadline).foregroundStyle(Theme.muted)
                    }
                    if let director {
                        Button {
                            store.signIn(as: director)
                        } label: {
                            Label("Continue as the director", systemImage: "arrow.right.circle.fill")
                                .font(.headline)
                                .frame(maxWidth: .infinity, minHeight: Spacing.minTapTarget)
                        }
                        .buttonStyle(.borderedProminent)
                        .accessibilityIdentifier(AccessibilityID.signInContinue)
                    }
                    VStack(alignment: .leading, spacing: Spacing.medium) {
                        Text("Or sign in as")
                            .font(.caption.weight(.bold)).foregroundStyle(Theme.accent)
                        ForEach(store.demoStaff) { staff in
                            Button {
                                store.signIn(as: staff)
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(staff.displayName).font(.headline)
                                            .foregroundStyle(Theme.ink)
                                        Text(staff.role.title).font(.footnote)
                                            .foregroundStyle(Theme.muted)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
                                }
                                .frame(maxWidth: .infinity, minHeight: Spacing.minTapTarget)
                                .card()
                            }
                            .buttonStyle(.plain)
                            .accessibilityElement(children: .combine)
                            .accessibilityIdentifier(AccessibilityID.signInRow(staff.id))
                        }
                    }
                    .accessibilityIdentifier(AccessibilityID.signInList)
                }
                .padding(Spacing.large)
                .frame(maxWidth: 560, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
            .themedScreen()
        }
    }
#endif
