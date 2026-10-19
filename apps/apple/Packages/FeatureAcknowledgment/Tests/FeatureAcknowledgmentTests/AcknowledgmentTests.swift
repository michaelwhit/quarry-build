import Foundation
import Testing

@testable import FeatureAcknowledgment

struct AcknowledgmentTests {
    @Test func placeholderWordingIsMarkedProposed() {
        #expect(AcknowledgmentText.isProposed)
        #expect(!AcknowledgmentText.points.isEmpty)
        #expect(AcknowledgmentText.points.allSatisfy { !$0.isEmpty })
    }

    @Test func recordKeepsVersionAndTimeThroughEncoding() throws {
        let when = Date(timeIntervalSince1970: 1_800_000_000)
        let record = AcknowledgmentRecord(acknowledgedAt: when)
        #expect(record.version == AcknowledgmentText.version)
        let data = try JSONEncoder().encode(record)
        #expect(try JSONDecoder().decode(AcknowledgmentRecord.self, from: data) == record)
    }
}
