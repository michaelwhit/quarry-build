import Foundation

/// Who has agreed to which wording. Someone who agreed to an older wording is asked again.
public protocol AcknowledgmentStoring: Sendable {
    func hasAcknowledged(_ person: UUID, version: String) -> Bool
    func record(_ record: AcknowledgmentRecord, for person: UUID) throws
}

/// Keeps every agreement in one JSON file, written atomically. This is the interim store for the
/// fake-data build; the sign-in code keeps the real record behind the same protocol.
public struct FileAcknowledgmentStore: AcknowledgmentStoring {
    private let url: URL

    public init(url: URL) {
        self.url = url
    }

    public func hasAcknowledged(_ person: UUID, version: String) -> Bool {
        (try? load())?[person.uuidString]?.version == version
    }

    public func record(_ record: AcknowledgmentRecord, for person: UUID) throws {
        // A damaged file is replaced; a read that fails for any other reason is thrown, so one
        // failed read never drops the other people's agreements.
        var all: [String: AcknowledgmentRecord]
        do {
            all = try load()
        } catch is DecodingError {
            all = [:]
        }
        all[person.uuidString] = record
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(all)
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        var options: Data.WritingOptions = [.atomic]
        #if os(iOS)
            options.insert(.completeFileProtectionUntilFirstUserAuthentication)
        #endif
        try data.write(to: url, options: options)
    }

    private func load() throws -> [String: AcknowledgmentRecord] {
        guard FileManager.default.fileExists(atPath: url.path) else { return [:] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([String: AcknowledgmentRecord].self, from: Data(contentsOf: url))
    }
}
