import SwiftUI

/// Type, color, spacing and accessible components shared by every screen. Track 3 grows this;
/// the foundation ships only the "TEST DATA" watermark that every screen must show while the
/// app holds synthetic data (CONTRIBUTING.md rule 1).
public enum DesignSystemModule {
    public static let name = "DesignSystem"
}

/// A diagonal-free, unobtrusive banner reminding everyone the data is fake.
public struct TestDataWatermark: ViewModifier {
    public init() {}

    public func body(content: Content) -> some View {
        // A strip above the screen, not an overlay, so the tag never covers a clock, a title or a
        // button on any screen.
        content.safeAreaInset(edge: .top, spacing: 0) {
            HStack {
                Spacer()
                Text("TEST DATA")
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(.orange, in: Capsule())
                    .foregroundStyle(.black)
                    .accessibilityLabel("Test data. No real student information.")
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Theme.background.ignoresSafeArea(edges: .top))
            .allowsHitTesting(false)
        }
    }
}

extension View {
    /// Marks the screen as showing synthetic data.
    public func testDataWatermark() -> some View {
        modifier(TestDataWatermark())
    }
}

/// Spacing scale shared by every screen so layouts stay consistent on Mac and iPhone.
public enum Spacing {
    public static let small: CGFloat = 8
    public static let medium: CGFloat = 16
    public static let large: CGFloat = 24
    /// Smallest comfortable tap target for one-handed data entry.
    public static let minTapTarget: CGFloat = 44
}

/// Stable accessibility identifiers for UI tests (XCUITest). Identifiers are never read aloud;
/// VoiceOver uses the visible labels. Row identifiers carry the record's id.
public enum AccessibilityID {
    public static let caseloadList = "caseload-list"
    public static let dashboard = "dashboard"
    public static let dashboardKPIs = "dashboard-kpis"
    public static let showDashboard = "show-dashboard"
    public static func dashboardRow(_ id: UUID) -> String { "dashboard-row-\(id.uuidString)" }
    public static func studentRow(_ id: UUID) -> String { "student-row-\(id.uuidString)" }
    public static let goalList = "goal-list"
    public static func goalRow(_ id: UUID) -> String { "goal-row-\(id.uuidString)" }
    public static let recordData = "record-data"
    public static let dataCorrect = "data-correct"
    public static let dataIncorrect = "data-incorrect"
    public static let dataUndo = "data-undo"
    public static let dataTimerToggle = "data-timer-toggle"
    public static let dataNote = "data-note"
    public static let dataSave = "data-save"
    public static let dataCancel = "data-cancel"
    public static let draftComment = "draft-comment"
    public static let draftSufficient = "draft-sufficient"
    public static let draftText = "draft-text"
    public static let draftApprove = "draft-approve"
    public static let draftReject = "draft-reject"
    public static let copyForSRS = "copy-for-srs"
    public static let undoApproval = "undo-approval"
    public static let accountMenu = "account-menu"
    public static let resetDemoData = "reset-demo-data"
    public static let resetConfirm = "reset-demo-data-confirm"
    public static let signOut = "sign-out"
    public static let startSession = "start-session"
    public static let showToday = "show-today"
    public static let signInList = "sign-in-list"
    public static func signInRow(_ id: UUID) -> String { "sign-in-row-\(id.uuidString)" }
    /// A number card on the overview, by its title in lower case with dashes ("needs-a-look").
    public static func kpi(_ title: String) -> String { "kpi-" + slug(title) }
    /// A place in the sidebar (Mac). On iPhone the tab bar buttons are found by their labels.
    public static func tab(_ name: String) -> String { "tab-\(name)" }
    public static let homeNumbers = "home-numbers"
    public static func homeTile(_ title: String) -> String { "home-tile-" + slug(title) }
    private static func slug(_ title: String) -> String {
        title.lowercased().split(whereSeparator: { !$0.isLetter && !$0.isNumber }).joined(separator: "-")
    }
}

extension AccessibilityID {
    /// Makes a container (stack, scroll view, grid) addressable without hiding the identifiers
    /// of the controls inside it. An identifier set straight on a container can replace its
    /// children's, so containers are exposed as their own element that still contains them.
    public static func container(_ id: String) -> ContainerModifier { ContainerModifier(id: id) }

    public struct ContainerModifier: ViewModifier {
        let id: String
        public func body(content: Content) -> some View {
            content
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier(id)
        }
    }
}
