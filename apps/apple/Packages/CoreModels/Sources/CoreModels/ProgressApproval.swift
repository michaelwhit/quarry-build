import Foundation

/// A teacher's approved answer to the SRS progress question for one goal: Sufficient Yes/No plus
/// a comment. AI never writes one of these; only a teacher action does (security design 7.5).
public struct ProgressApproval: Identifiable, Hashable, Codable, Sendable {
    public var id: UUID
    public var goalID: UUID
    public var studentID: UUID
    public var sufficient: Bool
    public var comment: String
    /// What the AI suggested, so the record shows whether the teacher changed it.
    public var aiSuggestedSufficient: Bool?
    public var aiSuggestedComment: String?
    public var wasEdited: Bool
    public var approvedBy: UUID
    public var approvedAt: Date
    /// Who drafted the suggestion, for example "mock-provider".
    public var provider: String?

    public init(
        id: UUID = UUIDv7.make(), goalID: UUID, studentID: UUID, sufficient: Bool, comment: String,
        aiSuggestedSufficient: Bool? = nil, aiSuggestedComment: String? = nil,
        wasEdited: Bool = false, approvedBy: UUID, approvedAt: Date = Date(),
        provider: String? = nil
    ) {
        self.id = id
        self.goalID = goalID
        self.studentID = studentID
        self.sufficient = sufficient
        self.comment = comment
        self.aiSuggestedSufficient = aiSuggestedSufficient
        self.aiSuggestedComment = aiSuggestedComment
        self.wasEdited = wasEdited
        self.approvedBy = approvedBy
        self.approvedAt = approvedAt
        self.provider = provider
    }

    enum CodingKeys: String, CodingKey {
        case id, sufficient, comment, provider
        case goalID = "goal_id"
        case studentID = "student_id"
        case aiSuggestedSufficient = "ai_suggested_sufficient"
        case aiSuggestedComment = "ai_suggested_comment"
        case wasEdited = "was_edited"
        case approvedBy = "approved_by"
        case approvedAt = "approved_at"
    }
}
