import DesignSystem
import FeatureEvaluation
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
    case today, caseload, caseloadSummary, libraries, evaluation
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
    @State private var intake: EvidenceIntake?
    @Environment(PrototypeStore.self) private var store
    let screens: ShellScreens

    init(screens: ShellScreens = ShellScreens()) {
        self.screens = screens
    }

    /// The places this role may open: a role never sees a tab it cannot use.
    private var visibleTabs: [AppTab] {
        let role = store.roleView
        return AppTab.allCases.filter { item in
            switch item {
            case .home: role.homeStyle == .numbersAndTiles && (role.showsToday || role.showsCaseload)
            case .today: role.showsToday
            case .caseload: role.showsCaseload
            case .libraries: role.showsLibraries
            case .more: true
            }
        }
    }

    private func title(of item: AppTab) -> String {
        item == .caseload ? store.roleView.caseloadTitle : item.title
    }

    /// Moves to the first place this role has when the current one is not theirs.
    private func settleTab() {
        if !visibleTabs.contains(tab) { tab = visibleTabs.first ?? .more }
    }

    var body: some View {
        shell
            .onAppear(perform: settleTab)
            .onChange(of: visibleTabs) { settleTab() }
            .environment(\.startSession, StartSessionAction { goals in start(goals) })
            .sheet(item: $launched) { launch in
                if let context = store.commitContext, let drafts = store.draftStore {
                    SessionHost(
                        launch: launch, store: store, context: context, drafts: drafts,
                        onClose: { launched = nil })
                }
            }
            .sheet(
                isPresented: Binding(get: { intake != nil }, set: { if !$0 { intake = nil } })
            ) {
                if let intake {
                    NavigationStack {
                        EvaluationIntakeView(intake: intake, done: { self.intake = nil })
                    }
                }
            }
    }

    /// Every student and staff name, so the redaction preview can remove them from pasted text.
    private func rosterNames() -> [String] {
        var names: [String] = []
        for student in store.allStudents {
            names.append(contentsOf: [
                student.firstName, student.lastName, "\(student.firstName) \(student.lastName)",
                student.preferredName ?? "",
            ])
        }
        for staff in store.demoStaff {
            names.append(staff.displayName)
            names.append(contentsOf: staff.displayName.split(separator: " ").map(String.init))
        }
        return names.filter { !$0.isEmpty }
    }

    @ViewBuilder
    private var shell: some View {
        #if os(macOS)
            NavigationSplitView {
                List(
                    visibleTabs,
                    selection: Binding<AppTab?>(get: { tab }, set: { tab = $0 ?? tab })
                ) { item in
                    Label(title(of: item), systemImage: item.systemImage)
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
                ForEach(visibleTabs) { item in
                    content(for: item)
                        .tabItem { Label(title(of: item), systemImage: item.systemImage) }
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
        case .evaluation: intake = EvidenceIntake(names: rosterNames())
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
