import CoreModels
import Foundation

/// One goal on a paraprofessional's list: the student's first name, the goal in short form, and
/// the full text and scoring note for when they tap it. Only these fields exist, so a screen built
/// from a card cannot show a last name, an id, a baseline or a history.
public struct ParaGoalCard: Identifiable, Equatable, Sendable {
    /// The goal's id.
    public var id: UUID
    public var studentID: UUID
    public var studentName: String
    public var shortText: String
    public var fullText: String
    /// How the teacher wants this goal scored, when one was written.
    public var scoringNote: String?
    /// Whether the session screen can record this goal's measure.
    public var canStart: Bool

    /// Whether tapping the card shows anything more than the short form.
    public var hasMore: Bool { fullText != shortText || scoringNote != nil }

    /// The goals sorted by name, then student (so two students who share a first name stay apart),
    /// then goal order. The name is the preferred or first name even
    /// if the caller passes a student with a last name still on it.
    public static func cards(
        from goals: [SessionGoal], scoringNotes: [UUID: String] = [:]
    ) -> [ParaGoalCard] {
        goals
            .map { item -> (order: Int, card: ParaGoalCard) in
                let full = item.goal.statement.trimmingCharacters(in: .whitespacesAndNewlines)
                let note = scoringNotes[item.goal.id]?.trimmingCharacters(in: .whitespacesAndNewlines)
                return (
                    item.goal.sequence,
                    ParaGoalCard(
                        id: item.goal.id, studentID: item.student.id,
                        studentName: firstName(of: item.student), shortText: shortForm(full), fullText: full,
                        scoringNote: note?.isEmpty == false ? note : nil,
                        canStart: item.isSupported)
                )
            }
            .sorted {
                ($0.card.studentName, $0.card.studentID.uuidString, $0.order)
                    < ($1.card.studentName, $1.card.studentID.uuidString, $1.order)
            }
            .map(\.card)
    }

    /// The text cut at a word near `limit` characters, with an ellipsis; short text is unchanged.
    static func shortForm(_ text: String, limit: Int = 100) -> String {
        guard text.count > limit else { return text }
        let head = text.prefix(limit)
        guard let space = head.lastIndex(of: " ") else { return String(head) + "…" }
        return String(head[..<space]) + "…"
    }

    private static func firstName(of student: Student) -> String {
        if let preferred = student.preferredName, !preferred.isEmpty { return preferred }
        return student.firstName
    }
}
