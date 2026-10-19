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

struct LoadFailureView: View {
    let message: String

    var body: some View {
        ContentUnavailableView(
            "Can't start", systemImage: "exclamationmark.triangle", description: Text(message))
    }
}
