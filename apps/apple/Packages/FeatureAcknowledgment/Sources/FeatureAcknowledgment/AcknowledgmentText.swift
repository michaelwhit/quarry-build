import Foundation

/// The words on the acknowledgment page. The wording is a placeholder until the district approves
/// the final text, so the page says so and the version name starts with "proposed".
public enum AcknowledgmentText {
    public static let version = "proposed-1"
    public static let isProposed = version.hasPrefix("proposed")

    public static let title = "Student privacy"
    public static let proposedNotice = "Proposed wording. Not final until the district approves it."

    public static let points: [String] = [
        "What you see here about students is private. Share it only with the staff who work with that student.",
        "Do not take photos, screenshots or notes of student information off this device.",
        "Do not share your sign-in with anyone. Sign out when you step away.",
        "Tell your case manager right away if a device is lost or you see something you should not.",
        "You can only see the goals your case manager has given you. If you need more, ask them.",
    ]

    public static let checkboxLabel = "I have read this and I agree."
}

/// What gets kept when someone agrees.
public struct AcknowledgmentRecord: Codable, Equatable, Sendable {
    public var version: String
    public var acknowledgedAt: Date

    public init(version: String = AcknowledgmentText.version, acknowledgedAt: Date) {
        self.version = version
        self.acknowledgedAt = acknowledgedAt
    }
}
