import CoreModels
import Foundation

/// A draft progress entry for one goal, written with a placeholder instead of the student's name.
///
/// The real AI gateway removes identifiers before any model call and puts them back afterwards.
/// The mock follows the same shape so the screens are built for it:
/// the draft carries `studentToken`, and `reidentified(as:)` restores the name for display only.
public struct ProgressDraft: Equatable, Sendable {
    public static let studentToken = "{{STUDENT}}"

    public var sufficient: Bool
    public var comment: String
    /// The data each sentence came from, shown so the teacher can check it.
    public var citations: [String]
    public var provider: String

    public func reidentified(as name: String) -> String {
        comment.replacingOccurrences(of: Self.studentToken, with: name)
    }
}

/// Writes a sample progress comment from the numbers alone. No network, no model: just a template
/// that reads like the comment SRS asks for (a measurable statement). Labeled as a sample
/// everywhere it appears.
public enum MockProgressDrafter {
    public static let providerName = "mock-provider"

    /// Nil when there is not yet enough data (fewer than three observations or no target).
    public static func draft(for goal: Goal, progress: GoalProgress) -> ProgressDraft? {
        guard let recent = progress.recentAverage, let first = progress.first,
            let target = progress.target, let sufficient = progress.suggestedSufficient
        else { return nil }
        let token = ProgressDraft.studentToken
        let count = progress.samples.count
        let since = first.date.formatted(
            .dateTime.month(.abbreviated).day().locale(Locale(identifier: "en_US")))
        let average = ValueFormat.string(recent, for: progress.plan)
        let start = ValueFormat.string(first.value, for: progress.plan)
        let goalValue = ValueFormat.string(target, for: progress.plan)

        var sentences = [
            "Across \(count) data sessions since \(since), \(token) averaged \(average) on the three most recent sessions, compared with \(start) at the first session (goal: \(goalValue))."
        ]
        var citations = [
            "\(count) data points on this goal",
            "Last three sessions average \(average)",
            "First session \(start)",
        ]
        if let trend = progress.trendPerWeek {
            let direction = trend > 0.05 ? "rising" : (trend < -0.05 ? "falling" : "flat")
            let weekly = ValueFormat.string(abs(trend), for: progress.plan)
            sentences.append("The trend is \(direction) by about \(weekly) per week.")
            citations.append("Trend line over all sessions")
        }
        if sufficient {
            sentences.append(
                "\(token) is making sufficient progress to meet this goal by the annual review; continue current supports.")
        } else {
            sentences.append(
                "\(token) is not yet making sufficient progress to meet this goal by the annual review; the team should review supports and instruction.")
        }
        return ProgressDraft(
            sufficient: sufficient, comment: sentences.joined(separator: " "), citations: citations,
            provider: providerName)
    }
}
