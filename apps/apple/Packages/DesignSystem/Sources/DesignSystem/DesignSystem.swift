import SwiftUI

/// Type, color, spacing and accessible components shared by every screen. This grows over time;
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
                Text("Practice data, no real students")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
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

/// A notice shown the first time the app opens: this build is for practice, with made-up
/// students only. It stays away once the person accepts it on this device.
public struct PracticeDataNotice: ViewModifier {
    @AppStorage("practiceDataNoticeAccepted") private var accepted = false

    public init() {}

    public func body(content: Content) -> some View {
        content.alert(
            "Practice data only",
            isPresented: Binding(get: { !accepted }, set: { _ in })
        ) {
            Button("I understand") { accepted = true }
                .accessibilityIdentifier("practice-notice-accept")
        } message: {
            Text(
                "This build is for practice. It holds made-up students and made-up data. Use made-up names only, and never enter real student information."
            )
        }
    }
}

extension View {
    /// Asks the person to accept, once, that this build is for practice data only.
    public func practiceDataNotice() -> some View {
        modifier(PracticeDataNotice())
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
    public static let historyRemove = "history-remove"
    public static let historyRemoveConfirm = "history-remove-confirm"
    public static let savePracticeFile = "save-practice-file"
    public static let loadPracticeFile = "load-practice-file"
    public static let showToday = "show-today"
    public static let signInList = "sign-in-list"
    public static let signInContinue = "sign-in-continue"
    public static func signInRow(_ id: UUID) -> String { "sign-in-row-\(id.uuidString)" }
    /// A number card on the overview, by its title in lower case with dashes ("needs-a-look").
    public static func kpi(_ title: String) -> String { "kpi-" + slug(title) }
    /// A place in the sidebar (Mac). On iPhone the tab bar buttons are found by their labels.
    public static func tab(_ name: String) -> String { "tab-\(name)" }
    public static let homeNumbers = "home-numbers"
    public static let addStudent = "add-student"
    public static let editStudent = "edit-student"
    public static let studentFirstName = "student-first-name"
    public static let studentLastName = "student-last-name"
    public static let studentPreferredName = "student-preferred-name"
    public static let studentGrade = "student-grade"
    public static let studentSchool = "student-school"
    public static let studentSave = "student-save"
    public static let studentCancel = "student-cancel"
    public static let studentFormProblem = "student-form-problem"
    public static let addGoal = "add-goal"
    public static let editGoal = "edit-goal"
    public static let goalArea = "goal-area"
    public static let goalStatement = "goal-statement"
    public static let goalCondition = "goal-condition"
    public static let goalBehavior = "goal-behavior"
    public static let goalCriteria = "goal-criteria"
    public static let goalBaseline = "goal-baseline"
    public static let goalTarget = "goal-target"
    public static let goalMeasure = "goal-measure"
    public static let goalUnit = "goal-unit"
    public static let goalTargetValue = "goal-target-value"
    public static let goalTrials = "goal-trials"
    public static let goalFrequency = "goal-frequency"
    public static let goalPromptLevels = "goal-prompt-levels"
    public static let goalSteps = "goal-steps"
    public static let goalSave = "goal-save"
    public static let goalCancel = "goal-cancel"
    public static let goalFormProblem = "goal-form-problem"
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
