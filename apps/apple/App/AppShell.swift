import DesignSystem
import FeatureSession
import Persistence
import SwiftUI

/// The five places in the app. Home is the first and is always one tap away (tab bar on iPhone,
/// sidebar on Mac), except inside a live session, which owns the whole screen.
enum AppTab: String, CaseIterable, Identifiable {
    case home, today, caseload, libraries, more

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home: "Home"
        case .today: "Today"
        case .caseload: "Caseload"
        case .libraries: "Libraries"
        case .more: "More"
        }
    }

    var systemImage: String {
        switch self {
        case .home: "house"
        case .today: "checklist"
        case .caseload: "person.2"
        case .libraries: "books.vertical"
        case .more: "ellipsis.circle"
        }
    }
}

/// Where a Home tile or number can send the teacher.
enum AppDestination {
    case today, caseload, caseloadSummary, libraries
}

/// Screens other parts of the app provide. Until a screen is wired in, its tab shows "Planned"
/// and opens nothing, so nothing in the shell is fake.
struct ShellScreens {
    var libraries: AnyView?
}

struct AppShell: View {
    @State private var tab: AppTab = .home
    @State private var selection: UUID?
    @State private var column: NavigationSplitViewColumn = .sidebar
    @State private var launched: LaunchedSession?
    @Environment(PrototypeStore.self) private var store
    let screens: ShellScreens

    init(screens: ShellScreens = ShellScreens()) {
        self.screens = screens
    }

    var body: some View {
        shell
            .environment(\.startSession, StartSessionAction { goals in start(goals) })
            .sheet(item: $launched) { launch in
                if let context = store.commitContext, let drafts = store.draftStore {
                    SessionHost(
                        launch: launch, store: store, context: context, drafts: drafts,
                        onClose: { launched = nil })
                }
            }
    }

    @ViewBuilder
    private var shell: some View {
        #if os(macOS)
            NavigationSplitView {
                List(
                    AppTab.allCases,
                    selection: Binding<AppTab?>(get: { tab }, set: { tab = $0 ?? tab })
                ) { item in
                    Label(item.title, systemImage: item.systemImage)
                        .tag(item)
                        .accessibilityIdentifier(AccessibilityID.tab(item.rawValue))
                }
                .navigationSplitViewColumnWidth(min: 160, ideal: 190, max: 240)
            } detail: {
                content(for: tab)
            }
            .themedScreen()
        #else
            TabView(selection: $tab) {
                ForEach(AppTab.allCases) { item in
                    content(for: item)
                        .tabItem { Label(item.title, systemImage: item.systemImage) }
                        .tag(item)
                }
            }
            .themedScreen()
        #endif
    }

    @ViewBuilder
    private func content(for tab: AppTab) -> some View {
        switch tab {
        case .home:
            NavigationStack { HomeView(screens: screens, todayAvailable: store.canRecordData, open: open) }
        case .today:
            todayScreen
        case .caseload:
            CaseloadScreen(selection: $selection, column: $column)
        case .libraries:
            if let libraries = screens.libraries { libraries } else { plannedScreen("Libraries") }
        case .more:
            NavigationStack { MoreView() }
        }
    }

    @ViewBuilder
    private var todayScreen: some View {
        if store.canRecordData, let context = store.commitContext, let drafts = store.draftStore {
            NavigationStack {
                TodayTab(
                    goals: store.allSessionGoals(), context: context, store: drafts,
                    deliver: { try store.deliver($0) })
            }
            .id(context.collectorID)
        } else {
            plannedScreen("Today")
        }
    }

    /// One session at a time: with one open, send the teacher to Today to finish or resume it.
    private func start(_ goals: [SessionGoal]) {
        if store.hasOpenSession {
            tab = .today
        } else {
            launched = LaunchedSession(goals: goals)
        }
    }

    private func plannedScreen(_ title: String) -> some View {
        NavigationStack {
            ContentUnavailableView(
                "Planned", systemImage: "hourglass",
                description: Text("\(title) is not available yet."))
                .themedScreen()
                .navigationTitle(title)
        }
    }

    private func open(_ destination: AppDestination) {
        switch destination {
        case .today: tab = .today
        case .libraries: tab = .libraries
        case .caseload:
            selection = nil
            column = .sidebar
            tab = .caseload
        case .caseloadSummary:
            selection = nil
            column = .detail
            tab = .caseload
        }
    }
}
