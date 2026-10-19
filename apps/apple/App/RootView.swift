import DesignSystem
import Persistence
import SwiftUI

/// Signed out: the sign-in screen. Signed in: the app shell (Home, Today, Caseload, Libraries, More).
struct RootView: View {
    @Environment(PrototypeStore.self) private var store

    var body: some View {
        Group {
            if store.currentStaff == nil {
                SignInView()
            } else if !store.roleView.runsOnThisDevice {
                PhoneOnlyView()
            } else {
                AppShell()
            }
        }
        #if DEMO_IDENTITY
            // Demo builds open signed in as the fake SPED director so the data shows at once.
            // Signing out still returns to the picker (this runs once, when the window appears).
            .task { await DemoSignIn.openAsDirector(store) }
        #endif
    }
}

/// Shown on a Mac to a role that works from an iPhone only.
struct PhoneOnlyView: View {
    @Environment(PrototypeStore.self) private var store

    var body: some View {
        ContentUnavailableView {
            Label("Open this on your iPhone", systemImage: "iphone")
        } description: {
            Text("Your role uses the iPhone app. Sign in there.")
        } actions: {
            Button("Sign out") { store.signOut() }
                .accessibilityIdentifier(AccessibilityID.signOut)
        }
        .themedScreen()
    }
}

struct LoadFailureView: View {
    let message: String

    var body: some View {
        ContentUnavailableView(
            "Can't start", systemImage: "exclamationmark.triangle", description: Text(message))
    }
}
