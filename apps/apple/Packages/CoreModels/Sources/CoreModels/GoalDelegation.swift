import Foundation

/// Gives one staff member data entry and a read-only view of one goal. Nothing else about the
/// student follows from it.
public struct GoalDelegation: Identifiable, Hashable, Codable, Sendable {
    public var id: UUID
    public var tenantID: UUID
    public var goalID: UUID
    public var staffID: UUID
    public var grantedBy: UUID
    /// When the delegation ends; nil means until it is stopped.
    public var expiresAt: Date?

    public init(
        id: UUID, tenantID: UUID, goalID: UUID, staffID: UUID, grantedBy: UUID,
        expiresAt: Date? = nil
    ) {
        self.id = id
        self.tenantID = tenantID
        self.goalID = goalID
        self.staffID = staffID
        self.grantedBy = grantedBy
        self.expiresAt = expiresAt
    }

    /// Whether the delegation still gives access at `date`.
    public func isActive(at date: Date) -> Bool {
        guard let expiresAt else { return true }
        return date < expiresAt
    }

    enum CodingKeys: String, CodingKey {
        case id
        case tenantID = "tenant_id"
        case goalID = "goal_id"
        case staffID = "staff_id"
        case grantedBy = "granted_by"
        case expiresAt = "expires_at"
    }
}
