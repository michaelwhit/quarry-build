import CoreModels
import Foundation

/// Where the one in-progress session is kept between taps.
public protocol SessionDraftStoring: Sendable {
    func load() throws -> SessionDraft?
    func save(_ draft: SessionDraft) throws
    func clear() throws
    /// Moves the draft out of the way without deleting it, for a session that can never be stored.
    func setAside() throws
}

/// Thrown by a delivery that retrying will never fix (the person lost access, the plan is gone).
/// The session keeps its data and offers to set it aside instead of blocking the next session.
public struct SessionDeliveryError: Error, Sendable {
    public init() {}
}

/// Keeps the draft in one file, written atomically after every tap. On iOS the file is protected
/// until first unlock so a rebooted, locked phone can still take a Live Activity tap later.
///
/// This is the interim store for the fake-data build. The encrypted database (Track 2) takes over
/// behind the same protocol, so the session screens do not change.
public struct FileDraftStore: SessionDraftStoring {
    private let url: URL

    public init(url: URL) {
        self.url = url
    }

    public func load() throws -> SessionDraft? {
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let data = try Data(contentsOf: url)
        return try JSONDecoder.coreModels.decode(SessionDraft.self, from: data)
    }

    public func save(_ draft: SessionDraft) throws {
        let data = try JSONEncoder.coreModels.encode(draft)
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        var options: Data.WritingOptions = [.atomic]
        #if os(iOS)
            options.insert(.completeFileProtectionUntilFirstUserAuthentication)
        #endif
        try data.write(to: url, options: options)
    }

    public func clear() throws {
        if FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }
    }

    public func setAside() throws {
        guard FileManager.default.fileExists(atPath: url.path) else { return }
        let stamp = ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-")
        let target = url.deletingLastPathComponent()
            .appendingPathComponent("needs-attention-\(stamp)-\(url.lastPathComponent)")
        try FileManager.default.moveItem(at: url, to: target)
    }
}

/// A store that keeps the draft in memory, for tests and previews.
public final class MemoryDraftStore: SessionDraftStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var draft: SessionDraft?
    public private(set) var saveCount = 0
    public private(set) var setAsideDrafts: [SessionDraft] = []

    public init(_ draft: SessionDraft? = nil) {
        self.draft = draft
    }

    public func load() throws -> SessionDraft? {
        lock.lock()
        defer { lock.unlock() }
        return draft
    }

    public func save(_ draft: SessionDraft) throws {
        lock.lock()
        defer { lock.unlock() }
        self.draft = draft
        saveCount += 1
    }

    public func clear() throws {
        lock.lock()
        defer { lock.unlock() }
        draft = nil
    }

    public func setAside() throws {
        lock.lock()
        defer { lock.unlock() }
        if let draft { setAsideDrafts.append(draft) }
        draft = nil
    }
}
