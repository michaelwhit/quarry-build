import CoreModels
import Foundation

/// Why a goal got no data in a session. Shown as a labeled gap on the graph (spec 10.3).
public enum NoDataReason: String, Codable, CaseIterable, Sendable {
    case absent
    case refused
    case shortSession = "short_session"
    case subTeacher = "sub_teacher"
    case newSetting = "new_setting"
    case behaviorIncident = "behavior_incident"

    public var title: String {
        switch self {
        case .absent: "Absent"
        case .refused: "Refused"
        case .shortSession: "Short session"
        case .subTeacher: "Sub teacher"
        case .newSetting: "New setting"
        case .behaviorIncident: "Behavior incident"
        }
    }

    /// Reasons that mean no data was collected at all for the goal. The others are context for a
    /// session that still has data, so they become part of the note.
    public var meansNoData: Bool {
        switch self {
        case .absent, .refused: true
        default: false
        }
    }
}

public enum TrialResult: String, Codable, Sendable {
    case correct
    case incorrect
}

/// One tap in a trial-based goal. Prompt-level goals record only the level.
public struct Trial: Codable, Hashable, Sendable {
    public var result: TrialResult?
    public var promptLevel: String?
    public var at: Date

    public init(result: TrialResult?, promptLevel: String? = nil, at: Date) {
        self.result = result
        self.promptLevel = promptLevel
        self.at = at
    }
}

/// What can be undone with the undo button. One per recorded action, newest last.
public enum UndoAction: Codable, Hashable, Sendable {
    case trial(entryID: UUID)
    case tally(entryID: UUID, delta: Int)
    case timerStarted(entryID: UUID)
    case timerStopped(entryID: UUID, startedAt: Date)
    case noData(entryID: UUID, previous: NoDataReason?)
    case note(entryID: UUID)

    var entryID: UUID {
        switch self {
        case .trial(let id), .timerStarted(let id): id
        case .tally(let id, _), .timerStopped(let id, _), .noData(let id, _): id
        case .note(let id): id
        }
    }
}

/// Everything recorded for one student and goal in a session.
public struct SessionEntry: Codable, Hashable, Sendable, Identifiable {
    public var id: UUID
    public var studentID: UUID
    public var goalID: UUID
    public var planID: UUID
    public var type: MeasurementType
    /// Planned trials per session, used for the "7 of 10" indicator.
    public var plannedTrials: Int?
    public var promptHierarchy: [String]
    public var trials: [Trial]
    public var tally: Int
    /// Completed timer episodes, in seconds. Several episodes add up (spec 10.3).
    public var episodes: [Double]
    public var runningSince: Date?
    public var noDataReason: NoDataReason?
    public var notes: [String]

    public init(
        id: UUID = UUID(), studentID: UUID, goalID: UUID, planID: UUID, type: MeasurementType,
        plannedTrials: Int? = nil, promptHierarchy: [String] = [], trials: [Trial] = [],
        tally: Int = 0, episodes: [Double] = [], runningSince: Date? = nil,
        noDataReason: NoDataReason? = nil, notes: [String] = []
    ) {
        self.id = id
        self.studentID = studentID
        self.goalID = goalID
        self.planID = planID
        self.type = type
        self.plannedTrials = plannedTrials
        self.promptHierarchy = promptHierarchy
        self.trials = trials
        self.tally = tally
        self.episodes = episodes
        self.runningSince = runningSince
        self.noDataReason = noDataReason
        self.notes = notes
    }

    public var correctCount: Int { trials.filter { $0.result == .correct }.count }
    public var incorrectCount: Int { trials.filter { $0.result == .incorrect }.count }

    public func durationSeconds(at now: Date) -> Double {
        let running = runningSince.map { max(0, now.timeIntervalSince($0)) } ?? 0
        return episodes.reduce(0, +) + running
    }

    /// Whether anything was recorded for this entry (a reason counts: it is a recorded fact).
    public var hasData: Bool { hasValues || noDataReason != nil }

    /// Whether any trial, tally or timer was recorded. Such an entry keeps its data even when a
    /// no-data reason is picked later; the reason then rides along as a note.
    public var hasValues: Bool {
        !trials.isEmpty || tally != 0 || !episodes.isEmpty || runningSince != nil
    }
}

/// A session in progress or just ended. Saved to the device after every tap so that an app
/// kill, reboot or dead battery loses nothing (spec 10.2 and 10.8). All changes go through the
/// mutating methods, which keep the undo log and the idle clock current.
public struct SessionDraft: Codable, Hashable, Sendable, Identifiable {
    /// A teacher can run these on the session screen. Others (rate, latency, rubric, interval,
    /// task analysis and so on) arrive with T3-15a and T3-15b; until then they use the goal screen.
    public static func supports(_ type: MeasurementType) -> Bool {
        switch type {
        case .trials, .yesNo, .promptLevel, .frequency, .duration: true
        default: false
        }
    }

    /// A session with no tap for this long ends on its own, keeping everything (spec 10.3).
    public static let idleLimit: TimeInterval = 20 * 60

    public var id: UUID
    public var startedAt: Date
    public var lastActivityAt: Date
    public var endedAt: Date?
    public var setting: String?
    public var entries: [SessionEntry]
    public var undoLog: [UndoAction]
    /// Filled when the session ends, and kept until the points are handed on, so a crash between
    /// "ended" and "saved elsewhere" repeats the same points (same ids) instead of making new ones.
    public var committedPoints: [DataPoint]?

    public init(
        id: UUID = UUIDv7.make(), startedAt: Date, setting: String? = nil,
        entries: [SessionEntry]
    ) {
        self.id = id
        self.startedAt = startedAt
        self.lastActivityAt = startedAt
        self.setting = setting
        self.entries = entries
        self.undoLog = []
    }

    public var isEnded: Bool { endedAt != nil }
    public var hasData: Bool { entries.contains { $0.hasData } }

    public func entry(_ id: UUID) -> SessionEntry? { entries.first { $0.id == id } }

    private func index(of id: UUID) -> Int? { entries.firstIndex { $0.id == id } }

    // MARK: Recording

    /// ✓ or ✗ for goals measured by trials or yes/no. A prompt tag may ride along.
    public mutating func recordTrial(
        _ result: TrialResult, entry id: UUID, promptLevel: String? = nil, at now: Date
    ) {
        guard !isEnded, let i = index(of: id) else { return }
        entries[i].trials.append(Trial(result: result, promptLevel: promptLevel, at: now))
        log(.trial(entryID: id), at: now)
    }

    /// One trial at a prompt level, for goals measured by independence.
    public mutating func recordPromptLevel(_ level: String, entry id: UUID, at now: Date) {
        guard !isEnded, let i = index(of: id), entries[i].promptHierarchy.contains(level) else {
            return
        }
        entries[i].trials.append(Trial(result: nil, promptLevel: level, at: now))
        log(.trial(entryID: id), at: now)
    }

    /// +1 or -1 on a counter. The count never goes below zero.
    public mutating func adjustTally(by delta: Int, entry id: UUID, at now: Date) {
        guard !isEnded, let i = index(of: id) else { return }
        let applied = max(entries[i].tally + delta, 0) - entries[i].tally
        guard applied != 0 else { return }
        entries[i].tally += applied
        log(.tally(entryID: id, delta: applied), at: now)
    }

    /// Starts the timer, or stops it and keeps the episode.
    public mutating func toggleTimer(entry id: UUID, at now: Date) {
        guard !isEnded, let i = index(of: id) else { return }
        if let started = entries[i].runningSince {
            entries[i].episodes.append(max(0, now.timeIntervalSince(started)))
            entries[i].runningSince = nil
            log(.timerStopped(entryID: id, startedAt: started), at: now)
        } else {
            entries[i].runningSince = now
            log(.timerStarted(entryID: id), at: now)
        }
    }

    /// Records why a goal has no data (or clears it with nil).
    public mutating func setNoData(_ reason: NoDataReason?, entry id: UUID, at now: Date) {
        guard !isEnded, let i = index(of: id) else { return }
        let previous = entries[i].noDataReason
        guard previous != reason else { return }
        entries[i].noDataReason = reason
        log(.noData(entryID: id, previous: previous), at: now)
    }

    public mutating func addNote(_ text: String, entry id: UUID, at now: Date) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !isEnded, !trimmed.isEmpty, let i = index(of: id) else { return }
        entries[i].notes.append(trimmed)
        log(.note(entryID: id), at: now)
    }

    /// Flips a recorded trial (tap on the trial strip).
    public mutating func flipTrial(at position: Int, entry id: UUID, at now: Date) {
        guard !isEnded, let i = index(of: id), entries[i].trials.indices.contains(position),
            let current = entries[i].trials[position].result
        else { return }
        entries[i].trials[position].result = current == .correct ? .incorrect : .correct
        lastActivityAt = now
    }

    /// Undoes this goal's most recent action. Returns false when there is nothing to undo.
    @discardableResult
    public mutating func undo(entry id: UUID, at now: Date) -> Bool {
        guard !isEnded, let i = index(of: id),
            let logIndex = undoLog.lastIndex(where: { $0.entryID == id })
        else { return false }
        switch undoLog.remove(at: logIndex) {
        case .trial:
            if !entries[i].trials.isEmpty { entries[i].trials.removeLast() }
        case .tally(_, let delta):
            entries[i].tally = max(entries[i].tally - delta, 0)
        case .timerStarted:
            entries[i].runningSince = nil
        case .timerStopped(_, let startedAt):
            if !entries[i].episodes.isEmpty { entries[i].episodes.removeLast() }
            entries[i].runningSince = startedAt
        case .noData(_, let previous):
            entries[i].noDataReason = previous
        case .note:
            if !entries[i].notes.isEmpty { entries[i].notes.removeLast() }
        }
        lastActivityAt = now
        return true
    }

    // MARK: Ending

    /// Whether the session has been idle long enough to end itself. A running timer counts as
    /// activity, so a long duration measure is not cut off.
    public func isIdle(at now: Date) -> Bool {
        guard !isEnded, !entries.contains(where: { $0.runningSince != nil }) else { return false }
        return now.timeIntervalSince(lastActivityAt) >= Self.idleLimit
    }

    /// Stops any timers and marks the session ended at `now`.
    mutating func finish(at now: Date) {
        for i in entries.indices {
            if let started = entries[i].runningSince {
                entries[i].episodes.append(max(0, now.timeIntervalSince(started)))
                entries[i].runningSince = nil
            }
        }
        endedAt = now
    }

    /// Counts a resume as activity, so a draft reopened after a long gap is not ended at once.
    mutating func touch(at now: Date) {
        lastActivityAt = now
    }

    private mutating func log(_ action: UndoAction, at now: Date) {
        undoLog.append(action)
        lastActivityAt = now
    }
}
