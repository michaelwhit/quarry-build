import CoreModels
import DesignSystem
import FeatureSession
import Persistence
import SwiftUI

extension PrototypeStore {
    /// The goals of one student that a session could cover, with the data already on file.
    func sessionGoals(for student: Student) -> [SessionGoal] {
        let shown = displayStudent(student)
        return goals(for: student).compactMap { goal in
            plan(for: goal).map {
                SessionGoal(student: shown, goal: goal, plan: $0, history: dataPoints(for: goal))
            }
        }
    }

    /// Every goal the signed-in person may take data on, for the Today tab.
    func allSessionGoals() -> [SessionGoal] {
        guard canRecordData else { return [] }
        return visibleStudents.flatMap { sessionGoals(for: $0) }
    }

    /// Who is recording, for the data points a session produces. Nil when nobody is signed in.
    var commitContext: CommitContext? {
        currentStaff.map {
            CommitContext(tenantID: $0.tenantID, collectorID: $0.id, deviceID: deviceID)
        }
    }

    /// One draft file per person, so a teacher who signs out never leaves taps for the next one.
    var draftStore: FileDraftStore? {
        guard let staff = currentStaff,
            let support = try? FileManager.default.url(
                for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil,
                create: true)
        else { return nil }
        return FileDraftStore(
            url:
                support
                .appendingPathComponent("IEPAssistantPrototype", isDirectory: true)
                .appendingPathComponent("session-draft-\(staff.id.uuidString).json"))
    }

    /// Whether an earlier session is still open or waiting to be stored. A new one must not
    /// overwrite it, so the caller sends the teacher to Today to resume.
    var hasOpenSession: Bool {
        guard let store = draftStore, let draft = try? store.load() else { return false }
        return draft.isEnded || draft.hasData
    }

    /// Stores a session's data points; repeating the same points is harmless.
    func deliver(_ points: [DataPoint]) throws {
        do {
            try addPoints(points)
        } catch let error as StoreError {
            switch error {
            case .saveFailed, .notSignedIn: throw error  // may work on retry
            case .notAllowed, .unknownPlan, .invalidDataPoint, .unknownSchool, .invalidStudent:
                throw SessionDeliveryError()
            }
        }
    }
}

/// How a screen asks the main view to start a session on some goals.
struct StartSessionAction: @unchecked Sendable {
    let run: @MainActor ([SessionGoal]) -> Void

    @MainActor
    func callAsFunction(_ goals: [SessionGoal]) { run(goals) }
}

extension EnvironmentValues {
    @Entry var startSession = StartSessionAction(run: { _ in })
}

/// A session being run from a goal or a student. Today starts its own through `TodayTab`.
struct LaunchedSession: Identifiable {
    let id = UUID()
    let goals: [SessionGoal]
}

/// The session screen for goals picked outside the Today tab.
struct SessionHost: View {
    @State private var model: SessionModel
    @State private var hideNames = false
    let onClose: () -> Void

    init(
        launch: LaunchedSession, store: PrototypeStore, context: CommitContext,
        drafts: FileDraftStore, onClose: @escaping () -> Void
    ) {
        let runnable = launch.goals.filter(\.isSupported)
        _model = State(
            initialValue: SessionModel(
                draft: SessionDraft.start(goals: runnable, at: Date()), goals: runnable,
                context: context, store: drafts, haptic: { Haptics.tick() },
                deliver: { try store.deliver($0) }))
        self.onClose = onClose
    }

    var body: some View {
        SessionView(model: model, hideNames: $hideNames, onClose: onClose)
            .themedScreen()
            // The session opens as a sheet, which sits above the app-wide strip.
            .testDataWatermark()
            #if os(macOS)
                .frame(minWidth: 460, minHeight: 680)
            #endif
    }
}

/// The "Start session" button used on the goal and student screens.
struct StartSessionButton: View {
    @Environment(PrototypeStore.self) private var store
    @Environment(\.startSession) private var startSession
    let goals: [SessionGoal]

    var body: some View {
        if store.canRecordData, goals.contains(where: \.isSupported) {
            Button {
                startSession(goals)
            } label: {
                Label("Start session", systemImage: "play.circle.fill")
            }
            .accessibilityIdentifier(AccessibilityID.startSession)
        }
    }
}
