import CoreModels
import Foundation
import Observation

/// The running session. Every change is saved at once; ending hands the data points on exactly
/// once. Views call these methods and read `draft`; they never touch storage.
@MainActor
@Observable
public final class SessionModel {
    public private(set) var draft: SessionDraft
    /// True when the last save failed. The screen says so, because a teacher who believes data is
    /// safe when it is not is the worst failure here.
    public private(set) var saveFailed = false
    /// True when the ended session's data could not be stored yet. The draft is kept, so nothing
    /// is lost; `retryDelivery()` tries again.
    public private(set) var deliveryFailed = false
    /// True when retrying cannot help; the screen offers `setAside()` instead of Try again.
    public private(set) var deliveryIsPermanent = false
    public private(set) var summaries: [GoalSummary] = []
    public private(set) var gaps: [NoDataGap] = []
    /// Goals whose notes or taps could not become data points; the summary names them.
    public private(set) var rejectedGoalIDs: [UUID] = []

    public let goals: [SessionGoal]
    @ObservationIgnored private let store: any SessionDraftStoring
    @ObservationIgnored private let context: CommitContext
    @ObservationIgnored private let clock: @Sendable () -> Date
    @ObservationIgnored private let haptic: @MainActor () -> Void
    @ObservationIgnored private let deliver: @MainActor ([DataPoint]) throws -> Void

    /// - Parameters:
    ///   - deliver: receives the data points when the session ends, and again after a failure or
    ///     a crash between ending and delivery. It may throw; the draft is cleared only after it
    ///     returns. The points keep their ids, so the receiver must skip ids it already holds.
    public init(
        draft: SessionDraft, goals: [SessionGoal], context: CommitContext,
        store: any SessionDraftStoring,
        clock: @escaping @Sendable () -> Date = { Date() },
        haptic: @escaping @MainActor () -> Void = {},
        deliver: @escaping @MainActor ([DataPoint]) throws -> Void
    ) {
        self.draft = draft
        self.goals = goals
        self.context = context
        self.store = store
        self.clock = clock
        self.haptic = haptic
        self.deliver = deliver
        if !self.draft.isEnded { self.draft.touch(at: clock()) }
        persist()
    }

    public var isEnded: Bool { draft.isEnded }

    /// The model's clock, for views that show elapsed time.
    public var now: Date { clock() }

    public func goal(for entry: SessionEntry) -> SessionGoal? {
        goals.first { $0.id == entry.goalID }
    }

    // MARK: Recording

    public func record(_ result: TrialResult, entry id: UUID, promptLevel: String? = nil) {
        change { $0.recordTrial(result, entry: id, promptLevel: promptLevel, at: $1) }
    }

    public func recordPromptLevel(_ level: String, entry id: UUID) {
        change { $0.recordPromptLevel(level, entry: id, at: $1) }
    }

    public func adjustTally(by delta: Int, entry id: UUID) {
        change { $0.adjustTally(by: delta, entry: id, at: $1) }
    }

    public func toggleTimer(entry id: UUID) {
        change { $0.toggleTimer(entry: id, at: $1) }
    }

    public func setNoData(_ reason: NoDataReason?, entry id: UUID) {
        change { $0.setNoData(reason, entry: id, at: $1) }
    }

    public func addNote(_ text: String, entry id: UUID) {
        change { $0.addNote(text, entry: id, at: $1) }
    }

    public func flipTrial(at position: Int, entry id: UUID) {
        change { $0.flipTrial(at: position, entry: id, at: $1) }
    }

    public func undo(entry id: UUID) {
        change { _ = $0.undo(entry: id, at: $1) }
    }

    public func canUndo(entry id: UUID) -> Bool {
        draft.undoLog.contains { $0.entryID == id }
    }

    private func change(_ edit: (inout SessionDraft, Date) -> Void) {
        guard !draft.isEnded else { return }
        edit(&draft, clock())
        persist()
        haptic()
    }

    // MARK: Ending

    /// Ends the session if it has been idle past the limit. Returns whether it ended.
    @discardableResult
    public func endIfIdle() -> Bool {
        guard draft.isIdle(at: clock()) else { return false }
        // The session ended when the teacher stopped, not when the app noticed; a draft found
        // the next morning must not date yesterday's data as today's.
        end(at: draft.lastActivityAt)
        return true
    }

    /// Ends the session: stops timers, builds the data points, saves them in the draft first, then
    /// delivers them and clears the draft. A crash anywhere in between repeats `resumeDelivery`.
    public func end() {
        end(at: clock())
    }

    private func end(at now: Date) {
        guard !draft.isEnded else { return }
        draft.finish(at: now)
        let plans = Dictionary(
            goals.map { ($0.plan.id, $0.plan) }, uniquingKeysWith: { first, _ in first })
        let result = draft.commit(context: context, plans: plans, at: now)
        draft.committedPoints = result.points
        persist()
        summaries = SessionSummary.make(draft: draft, goals: goals, result: result)
        gaps = result.gaps
        rejectedGoalIDs = draft.entries.filter { result.rejected.contains($0.id) }.map(\.goalID)
        hand(result.points)
    }

    /// For a draft found on launch that had already ended: hand its points on again.
    public func resumeDelivery() {
        guard draft.isEnded, let points = draft.committedPoints else { return }
        hand(points)
    }

    /// Tries again after a failed delivery.
    public func retryDelivery() {
        resumeDelivery()
    }

    /// Delivers, and clears the draft only when delivery worked.
    private func hand(_ points: [DataPoint]) {
        do {
            try deliver(points)
            deliveryFailed = false
            deliveryIsPermanent = false
            try? store.clear()
        } catch {
            deliveryFailed = true
            deliveryIsPermanent = error is SessionDeliveryError
        }
    }

    /// For a session that can never be stored: keeps the data in a separate file and frees the
    /// teacher to start another session.
    public func setAside() {
        do {
            try store.setAside()
            deliveryFailed = false
            deliveryIsPermanent = false
        } catch {
            saveFailed = true
        }
    }

    private func persist() {
        do {
            try store.save(draft)
            saveFailed = false
        } catch {
            saveFailed = true
        }
    }
}
