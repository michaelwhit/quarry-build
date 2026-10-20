import Foundation
import Testing

@testable import FeatureAcknowledgment

struct AcknowledgmentStoreTests {
    func tempURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("demo-ack-\(UUID().uuidString)")
            .appendingPathComponent("acknowledgments.json")
    }

    let when = Date(timeIntervalSince1970: 1_800_000_000)

    @Test func nobodyHasAgreedAtFirst() {
        let store = FileAcknowledgmentStore(url: tempURL())
        #expect(!store.hasAcknowledged(UUID(), version: AcknowledgmentText.version))
    }

    @Test func anAgreementIsKeptForThatPersonAndWording() throws {
        let url = tempURL()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        let store = FileAcknowledgmentStore(url: url)
        let first = UUID()
        let second = UUID()
        try store.record(AcknowledgmentRecord(acknowledgedAt: when), for: first)

        #expect(store.hasAcknowledged(first, version: AcknowledgmentText.version))
        #expect(!store.hasAcknowledged(second, version: AcknowledgmentText.version))
        #expect(!store.hasAcknowledged(first, version: "another-wording"))

        // A new store on the same file sees the same agreement.
        #expect(
            FileAcknowledgmentStore(url: url)
                .hasAcknowledged(first, version: AcknowledgmentText.version))
    }

    @Test func agreeingAgainKeepsOtherPeople() throws {
        let url = tempURL()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        let store = FileAcknowledgmentStore(url: url)
        let first = UUID()
        let second = UUID()
        try store.record(AcknowledgmentRecord(acknowledgedAt: when), for: first)
        try store.record(AcknowledgmentRecord(version: "later-wording", acknowledgedAt: when), for: second)
        try store.record(AcknowledgmentRecord(acknowledgedAt: when), for: second)

        #expect(store.hasAcknowledged(first, version: AcknowledgmentText.version))
        #expect(store.hasAcknowledged(second, version: AcknowledgmentText.version))
    }

    @Test func aDamagedFileMeansAskAgain() throws {
        let url = tempURL()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("not json".utf8).write(to: url)
        let store = FileAcknowledgmentStore(url: url)
        let person = UUID()
        #expect(!store.hasAcknowledged(person, version: AcknowledgmentText.version))
        try store.record(AcknowledgmentRecord(acknowledgedAt: when), for: person)
        #expect(store.hasAcknowledged(person, version: AcknowledgmentText.version))
    }
}
