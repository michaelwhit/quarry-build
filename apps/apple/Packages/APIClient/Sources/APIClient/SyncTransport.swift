import CoreModels
import Foundation

/// The two sync calls (`POST /v0/sync/push`, `GET /v0/sync/changes`). The URLSession
/// implementation lands with the PR that wires APIClient into the apps; tests and previews use
/// in-memory transports.
public protocol SyncTransport: Sendable {
    /// Sends outbox entries. Results come back in request order.
    func push(deviceID: UUID, entries: [OutboxEntry]) async throws -> [MutationResult]

    /// Fetches the changes after `since`.
    func changes(since: Int64, limit: Int) async throws -> SyncPage
}
