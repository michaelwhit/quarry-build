import DesignSystem
import FeatureAcknowledgment
import Persistence
import SwiftUI

/// Signed out: the sign-in screen. Signed in: the app shell (Home, Today, Caseload, Libraries, More).
struct RootView: View {
    @Environment(PrototypeStore.self) private var store
    let acknowledgments: any AcknowledgmentStoring

    var body: some View {
        Group {
            if let staff = store.currentStaff {
                if !store.roleView.runsOnThisDevice {
                    PhoneOnlyView()
                } else if store.roleView.needsAcknowledgment {
                    AcknowledgmentGate(staffID: staff.id, ledger: acknowledgments) { AppShell() }
                } else {
                    AppShell()
                }
            } else {
                SignInView()
            }
        }
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

/// Shows the confidentiality page until this person has agreed to the current wording, then the
/// app. Disagreeing signs them out.
struct AcknowledgmentGate<Content: View>: View {
    @Environment(PrototypeStore.self) private var store
    private let staffID: UUID
    private let ledger: any AcknowledgmentStoring
    private let content: Content
    /// Read once when the gate opens, then kept here so the file is not read on every redraw.
    @State private var agreed: Bool
    @State private var saveFailed = false

    init(
        staffID: UUID, ledger: any AcknowledgmentStoring, @ViewBuilder content: () -> Content
    ) {
        self.staffID = staffID
        self.ledger = ledger
        self.content = content()
        _agreed = State(
            initialValue: ledger.hasAcknowledged(staffID, version: AcknowledgmentText.version))
    }

    var body: some View {
        if agreed {
            content
        } else {
            AcknowledgmentView(onAgree: agree, onDecline: { store.signOut() })
                .alert("Couldn't save", isPresented: $saveFailed) {
                    Button("OK", role: .cancel) {}
                } message: {
                    Text("Your agreement was not saved. Try again.")
                }
        }
    }

    private func agree(_ record: AcknowledgmentRecord) {
        do {
            try ledger.record(record, for: staffID)
            agreed = true
        } catch {
            saveFailed = true
        }
    }
}

struct LoadFailureView: View {
    let message: String

    var body: some View {
        ContentUnavailableView(
            "Can't start", systemImage: "exclamationmark.triangle", description: Text(message))
    }
}
