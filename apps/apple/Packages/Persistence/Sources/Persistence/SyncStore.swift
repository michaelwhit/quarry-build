import CoreModels
import Foundation

/// What the sync engine needs from the on-device database. The encrypted GRDB + SQLCipher store
/// conforms to this; `InMemorySyncStore` serves tests and previews.
public protocol SyncStore: Sendable {
    /// The position of the last change applied (0 before the first sync).
    func cursor() async throws -> Int64

    /// Entries waiting to be pushed, oldest first.
    func pendingOutbox(limit: Int) async throws -> [OutboxEntry]

    func pendingOutboxCount() async throws -> Int

    /// Settles one pushed batch in a single step: entries the server applied are dropped, entries
    /// it refused move to quarantine. Nothing a teacher recorded is ever deleted by a refusal.
    func settle(applied: [UUID], quarantine: [QuarantinedEntry]) async throws

    /// Entries the server refused, oldest first, for the "needs attention" list.
    func quarantined() async throws -> [QuarantinedEntry]

    /// Moves quarantined entries back to the outbox with their attempt count raised by one.
    func requeue(ids: [UUID]) async throws

    /// The teacher chose to give up on these entries.
    func discardQuarantined(ids: [UUID]) async throws

    /// Applies a page of changes and moves the cursor in one atomic step, so a crash can never
    /// leave rows applied with an old cursor and no way to know (re-applying is harmless, losing
    /// the cursor move is not).
    func apply(changes: [SyncChange], cursor: Int64) async throws
}

/// A dictionary-backed store with the same rules as the real one: upserts by id, tombstones
/// remove rows, and losing the caller's own last caseload assignment for a student purges that
/// student. Only the caller's own assignments count: a tenant-wide
/// reader (director, building coordinator) also receives other staff members' assignment changes
/// and must never lose a student because someone else's assignment ended. Without an
/// `ownStaffId` the store never purges on assignment changes.
///
/// Delegated-only roles (gen-ed teachers, paraprofessionals) also lose a goal's rows when their
/// own delegation of it is deleted or expires; every other role sees all goals of its students.
public actor InMemorySyncStore: SyncStore {
    private struct Assignment {
        var student: UUID
        var endDate: String?  // school date, yyyy-MM-dd
    }
    private struct Delegation {
        var goal: UUID
        var expiresAt: Date?
    }

    private var position: Int64 = 0
    private var outbox: [OutboxEntry] = []
    private var quarantine: [QuarantinedEntry] = []
    /// Rows by entity, then id.
    public private(set) var rows: [String: [UUID: [String: JSONValue]]] = [:]
    /// The caller's own assignments and delegations by id, remembered because a tombstone
    /// carries no row.
    private var assignments: [UUID: Assignment] = [:]
    private var delegations: [UUID: Delegation] = [:]
    private let ownStaffId: UUID?
    private let delegatedGoalsOnly: Bool
    private let now: @Sendable () -> Date

    public init(
        ownStaffId: UUID? = nil,
        delegatedGoalsOnly: Bool = false,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.ownStaffId = ownStaffId
        self.delegatedGoalsOnly = delegatedGoalsOnly
        self.now = now
    }

    public func cursor() async throws -> Int64 { position }

    public func pendingOutbox(limit: Int) async throws -> [OutboxEntry] {
        Array(outbox.prefix(limit))
    }

    public func pendingOutboxCount() async throws -> Int { outbox.count }

    public func settle(applied: [UUID], quarantine items: [QuarantinedEntry]) async throws {
        let gone = Set(applied).union(items.map(\.id))
        outbox.removeAll { gone.contains($0.id) }
        quarantine.append(contentsOf: items)
    }

    public func quarantined() async throws -> [QuarantinedEntry] { quarantine }

    public func requeue(ids: [UUID]) async throws {
        let wanted = Set(ids)
        for item in quarantine where wanted.contains(item.id) {
            var entry = item.entry
            entry.attempts += 1
            outbox.append(entry)
        }
        quarantine.removeAll { wanted.contains($0.id) }
    }

    public func discardQuarantined(ids: [UUID]) async throws {
        let gone = Set(ids)
        quarantine.removeAll { gone.contains($0.id) }
    }

    /// Queues a mutation, as the local write path does in the same transaction as the row.
    public func enqueue(_ entry: OutboxEntry) {
        outbox.append(entry)
    }

    public func apply(changes: [SyncChange], cursor: Int64) async throws {
        for change in changes {
            if change.deleted {
                remove(change)
            } else if let row = change.row {
                rows[change.entity, default: [:]][change.id] = row
                remember(change.entity, change.id, row)
            }
        }
        sweepEnded()
        position = max(position, cursor)
    }

    public func ids(of entity: String) -> Set<UUID> {
        Set(rows[entity, default: [:]].keys)
    }

    private func remember(_ entity: String, _ id: UUID, _ row: [String: JSONValue]) {
        guard let own = ownStaffId, uuid(row["staff_id"]) == own else { return }
        switch entity {
        case "caseload_assignment":
            if let student = uuid(row["student_id"]) {
                assignments[id] = Assignment(
                    student: student, endDate: row["end_date"]?.stringValue)
            }
        case "goal_delegation":
            if let goal = uuid(row["goal_id"]) {
                delegations[id] = Delegation(
                    goal: goal, expiresAt: row["expires_at"]?.stringValue.flatMap(parseInstant))
            }
        default:
            break
        }
    }

    private func remove(_ change: SyncChange) {
        rows[change.entity]?[change.id] = nil
        switch change.entity {
        case "caseload_assignment":
            guard let ended = assignments.removeValue(forKey: change.id) else { return }
            endAssignment(of: ended.student)
        case "goal_delegation":
            guard let ended = delegations.removeValue(forKey: change.id) else { return }
            endDelegation(of: ended.goal)
        default:
            break
        }
    }

    /// Assignments past their end date and delegations past their expiry end like a tombstone.
    private func sweepEnded() {
        let today = schoolDate(now())
        for (id, a) in assignments {
            if let end = a.endDate, end < today {
                assignments[id] = nil
                endAssignment(of: a.student)
            }
        }
        let instant = now()
        for (id, d) in delegations {
            if let expiry = d.expiresAt, expiry <= instant {
                delegations[id] = nil
                endDelegation(of: d.goal)
            }
        }
    }

    private func endAssignment(of student: UUID) {
        // Another active assignment keeps the student on this device.
        if assignments.values.contains(where: { $0.student == student }) { return }
        purge(student: student)
    }

    private func endDelegation(of goal: UUID) {
        guard delegatedGoalsOnly else { return }
        if delegations.values.contains(where: { $0.goal == goal }) { return }
        purge(goals: [goal])
    }

    private func uuid(_ value: JSONValue?) -> UUID? {
        value?.stringValue.flatMap { UUID(uuidString: $0) }
    }

    private func parseInstant(_ text: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: text) { return date }
        return ISO8601DateFormatter().date(from: text)
    }

    /// The school's calendar date: State follows Central time, whatever the device says.
    private func schoolDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "America/Chicago")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private func purge(student: UUID) {
        rows["student"]?[student] = nil
        for (id, row) in rows["iep"] ?? [:] where uuid(row["student_id"]) == student {
            rows["iep"]?[id] = nil
        }
        var goals = Set<UUID>()
        for (id, row) in rows["goal"] ?? [:] where uuid(row["student_id"]) == student {
            goals.insert(id)
        }
        purge(goals: goals)
    }

    /// Removes the goals and everything recorded under them.
    private func purge(goals: Set<UUID>) {
        for id in goals { rows["goal"]?[id] = nil }
        for entity in ["objective", "measurement_plan", "data_point"] {
            for (id, row) in rows[entity] ?? [:] {
                if let goal = uuid(row["goal_id"]), goals.contains(goal) {
                    rows[entity]?[id] = nil
                }
            }
        }
    }
}
