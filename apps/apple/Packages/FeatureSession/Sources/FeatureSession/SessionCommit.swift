import CoreModels
import Foundation

/// A goal that got no data, with the reason. The graph shows a labeled gap; storing it needs the
/// `no_data_reason` column the server adds later, so for now it only reaches the summary.
public struct NoDataGap: Hashable, Sendable {
    public var goalID: UUID
    public var studentID: UUID
    public var reason: NoDataReason
}

public struct CommitResult: Sendable {
    public var points: [DataPoint]
    public var gaps: [NoDataGap]
    /// Entries whose data did not fit their plan; nothing is dropped silently.
    public var rejected: [UUID]
}

/// Who is recording, for the data points a session produces.
public struct CommitContext: Sendable {
    public var tenantID: UUID
    public var collectorID: UUID
    public var deviceID: UUID

    public init(tenantID: UUID, collectorID: UUID, deviceID: UUID) {
        self.tenantID = tenantID
        self.collectorID = collectorID
        self.deviceID = deviceID
    }
}

extension SessionDraft {
    /// Turns the recorded entries into append-only data points, one per student and goal
    ///. Prompt-level goals make one point per trial until `trials jsonb` exists
    ///, so no tap is lost. Call once; the result is kept in `committedPoints`.
    public func commit(
        context: CommitContext, plans: [UUID: MeasurementPlan], at now: Date
    ) -> CommitResult {
        var points: [DataPoint] = []
        var gaps: [NoDataGap] = []
        var rejected: [UUID] = []
        let observedAt = endedAt ?? now

        for entry in entries {
            if let reason = entry.noDataReason, reason.meansNoData, !entry.hasValues {
                gaps.append(
                    NoDataGap(goalID: entry.goalID, studentID: entry.studentID, reason: reason))
                continue
            }
            guard entry.hasData, let plan = plans[entry.planID] else {
                if entry.hasData || !entry.notes.isEmpty { rejected.append(entry.id) }
                continue
            }
            let note = Self.note(for: entry)
            // A note rides on one point per goal, so a typed note shows once, not once per trial.
            func make(
                valueNum: Double? = nil, correct: Int? = nil, total: Int? = nil,
                promptLevel: String? = nil, note: String? = nil, at time: Date
            ) -> DataPoint {
                DataPoint(
                    tenantID: context.tenantID, goalID: entry.goalID, planID: entry.planID,
                    observedAt: time, valueNum: valueNum, correct: correct, total: total,
                    promptLevel: promptLevel, setting: setting, note: note,
                    collectorID: context.collectorID, deviceID: context.deviceID,
                    clientCreatedAt: now)
            }

            var made: [DataPoint] = []
            switch entry.type {
            case .trials, .yesNo:
                guard !entry.trials.isEmpty else {
                    if note != nil { rejected.append(entry.id) }
                    continue
                }
                made = [
                    make(
                        correct: entry.correctCount, total: entry.trials.count, note: note,
                        at: observedAt)
                ]
            case .promptLevel:
                let leveled = entry.trials.filter { $0.promptLevel != nil }
                made = leveled.enumerated().compactMap { offset, trial -> DataPoint? in
                    guard let level = trial.promptLevel,
                        let index = entry.promptHierarchy.firstIndex(of: level)
                    else { return nil }
                    let last = offset == leveled.count - 1
                    return make(
                        valueNum: Double(index), promptLevel: level, note: last ? note : nil,
                        at: trial.at)
                }
            case .frequency:
                made = [make(valueNum: Double(entry.tally), note: note, at: observedAt)]
            case .duration:
                let seconds = entry.durationSeconds(at: observedAt)
                guard seconds > 0 else {
                    if note != nil { rejected.append(entry.id) }
                    continue
                }
                let unit = plan.unit?.lowercased() ?? "minutes"
                let value = unit.hasPrefix("sec") ? seconds : seconds / 60
                made = [make(valueNum: (value * 10).rounded() / 10, note: note, at: observedAt)]
            default:
                rejected.append(entry.id)
                continue
            }

            let valid = made.filter { (try? $0.validate(against: plan)) != nil }
            if valid.count != made.count || made.isEmpty { rejected.append(entry.id) }
            points.append(contentsOf: valid)
        }
        return CommitResult(points: points, gaps: gaps, rejected: rejected)
    }

    /// The note that rides on a goal's data point: context reasons and typed or dictated notes.
    static func note(for entry: SessionEntry) -> String? {
        var parts: [String] = []
        if let reason = entry.noDataReason { parts.append(reason.title) }
        let prompted = entry.trials.filter { $0.promptLevel != nil && $0.result != nil }.count
        if prompted > 0 { parts.append("\(prompted) prompted") }
        parts.append(contentsOf: entry.notes)
        guard !parts.isEmpty else { return nil }
        return String(parts.joined(separator: "; ").prefix(DataPoint.maxNoteLength))
    }
}
