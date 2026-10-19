import DesignSystem
import FeatureSession
import FeatureStudents
import Persistence
import SwiftUI

/// The Caseload tab: the student list with the caseload summary and each student's goals. On
/// iPhone this is one navigation stack (back buttons are labelled by SwiftUI with the title of the
/// screen they return to); on Mac the list sits beside the detail.
struct CaseloadScreen: View {
    @Environment(PrototypeStore.self) private var store
    @Binding var selection: UUID?
    @Binding var column: NavigationSplitViewColumn

    var body: some View {
        #if os(macOS)
            HSplitView {
                list.frame(minWidth: 260, idealWidth: 300, maxWidth: 380)
                detail.frame(minWidth: 420)
            }
            .themedScreen()
        #else
            NavigationSplitView(preferredCompactColumn: $column) {
                list
            } detail: {
                detail
            }
            .themedScreen()
        #endif
    }

    private var list: some View {
        CaseloadView(selection: $selection)
            .safeAreaInset(edge: .top) {
                Button {
                    selection = nil
                    column = .detail
                } label: {
                    Label("Caseload summary", systemImage: "chart.line.uptrend.xyaxis")
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .frame(minHeight: Spacing.minTapTarget)
                }
                .buttonStyle(.plain)
                .foregroundStyle(selection == nil ? Theme.primary : Theme.ink)
                .padding(.horizontal, Spacing.medium)
                .accessibilityIdentifier(AccessibilityID.showDashboard)
            }
    }

    @ViewBuilder
    private var detail: some View {
        if let id = selection, let student = store.visibleStudents.first(where: { $0.id == id }) {
            NavigationStack {
                StudentDetailView(student: student) { goal in
                    GoalScreen(student: student, goal: goal)
                }
                .toolbar {
                    ToolbarItem {
                        StartSessionButton(goals: store.sessionGoals(for: student))
                    }
                }
            }
            .id(student.id)
        } else {
            NavigationStack {
                DashboardView { selection = $0 }
            }
        }
    }
}
