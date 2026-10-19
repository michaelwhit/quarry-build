import Foundation

/// A JSON value of any shape. Sync rows travel as these so the wire format can grow a field
/// without every device release having to know about it on the same day.
public enum JSONValue: Hashable, Codable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case .bool(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        }
    }

    /// Converts any Codable value (using the API's date and key conventions) to a JSONValue.
    public init<T: Encodable>(encoding value: T) throws {
        let data = try JSONEncoder.coreModels.encode(value)
        self = try JSONDecoder().decode(JSONValue.self, from: data)
    }

    public var stringValue: String? {
        if case .string(let value) = self { return value }
        return nil
    }

    public subscript(key: String) -> JSONValue? {
        if case .object(let fields) = self { return fields[key] }
        return nil
    }
}

/// One row (or tombstone) from `GET /v0/sync/changes`.
public struct SyncChange: Hashable, Codable, Sendable {
    public var entity: String
    public var id: UUID
    /// The row's position in the change feed (the later of its own change and the moment it
    /// became visible to this caller). Apply as an upsert; positions only move forward.
    public var serverSeq: Int64
    /// True for a tombstone: remove the row. Tombstones carry no row.
    public var deleted: Bool
    public var row: [String: JSONValue]?

    public init(
        entity: String, id: UUID, serverSeq: Int64, deleted: Bool = false,
        row: [String: JSONValue]? = nil
    ) {
        self.entity = entity
        self.id = id
        self.serverSeq = serverSeq
        self.deleted = deleted
        self.row = row
    }

    enum CodingKeys: String, CodingKey {
        case entity, id, deleted, row
        case serverSeq = "server_seq"
    }
}

/// One page of the change feed. `cursor` is the position to ask for next.
public struct SyncPage: Hashable, Codable, Sendable {
    public var changes: [SyncChange]
    public var cursor: Int64
    public var hasMore: Bool

    public init(changes: [SyncChange], cursor: Int64, hasMore: Bool) {
        self.changes = changes
        self.cursor = cursor
        self.hasMore = hasMore
    }

    enum CodingKeys: String, CodingKey {
        case changes, cursor
        case hasMore = "has_more"
    }
}

/// A mutation waiting to be sent. The id is the idempotency key: a retry after a dropped
/// connection carries the same id, so the server applies it once.
public struct OutboxEntry: Identifiable, Hashable, Codable, Sendable {
    public var id: UUID
    public var entity: String
    public var payload: JSONValue
    public var createdAt: Date
    /// How many times the server has refused this entry and it was queued again.
    public var attempts: Int

    public init(
        id: UUID = UUIDv7.make(), entity: String, payload: JSONValue, createdAt: Date = Date(),
        attempts: Int = 0
    ) {
        self.id = id
        self.entity = entity
        self.payload = payload
        self.createdAt = createdAt
        self.attempts = attempts
    }

    /// An outbox entry that inserts a data point.
    public init(dataPoint: DataPoint) throws {
        self.init(entity: "data_point", payload: try JSONValue(encoding: dataPoint))
    }

    enum CodingKeys: String, CodingKey {
        case id, entity, payload, createdAt, attempts
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        entity = try container.decode(String.self, forKey: .entity)
        payload = try container.decode(JSONValue.self, forKey: .payload)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        attempts = try container.decodeIfPresent(Int.self, forKey: .attempts) ?? 0
    }
}

/// An entry the server refused. The teacher's data is never dropped: it stays on the device,
/// out of the outbox, until the app shows it as "needs attention" and the teacher fixes,
/// re-queues or discards it.
public struct QuarantinedEntry: Identifiable, Hashable, Codable, Sendable {
    public var entry: OutboxEntry
    public var status: MutationResult.Status
    /// The server's machine-readable reason ("unknown_goal", "goal_not_delegated", ...).
    public var reason: String
    public var quarantinedAt: Date

    public var id: UUID { entry.id }

    public init(
        entry: OutboxEntry, status: MutationResult.Status, reason: String,
        quarantinedAt: Date = Date()
    ) {
        self.entry = entry
        self.status = status
        self.reason = reason
        self.quarantinedAt = quarantinedAt
    }
}

/// What the server decided about one pushed mutation.
public struct MutationResult: Hashable, Codable, Sendable {
    public enum Status: String, Codable, Sendable {
        case applied, conflict, rejected
    }

    public var idempotencyKey: UUID
    public var status: Status
    /// A machine-readable reason when rejected. Never contains student data.
    public var reason: String?

    public init(idempotencyKey: UUID, status: Status, reason: String? = nil) {
        self.idempotencyKey = idempotencyKey
        self.status = status
        self.reason = reason
    }

    enum CodingKeys: String, CodingKey {
        case status, reason
        case idempotencyKey = "idempotency_key"
    }
}
