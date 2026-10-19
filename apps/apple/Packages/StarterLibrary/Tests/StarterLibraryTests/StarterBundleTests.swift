import Foundation
import Testing

@testable import StarterLibrary

// A bundle signed once with a throwaway key; only the public key is kept. Regenerate with the
// library package's `library-bundle` tool if the content model changes.
private let signerId = "705da5115c080fe7"
private let pinnedPub = Data(base64Encoded: "+CkW4ZPavatsc3IYYihHJKItHHBmvsIQjKkOeT6SyhY=")!
private let payloadB64 =
    "eyJzY2hlbWFfdmVyc2lvbiI6MSwiYnVuZGxlX3ZlcnNpb24iOjcsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE4VDAwOjAwOjAwWiIsInRheG9ub215IjpbeyJpZCI6IjAxOTAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDAwMSIsImxldmVsIjoiZG9tYWluIiwibmFtZSI6IkFjYWRlbWljIiwic3lub255bXMiOltdLCJzb3J0IjoxfSx7ImlkIjoiMDE5MDAwMDAtMDAwMC03MDAwLTgwMDAtMDAwMDAwMDAwMDAyIiwicGFyZW50X2lkIjoiMDE5MDAwMDAtMDAwMC03MDAwLTgwMDAtMDAwMDAwMDAwMDAxIiwibGV2ZWwiOiJhcmVhIiwibmFtZSI6IlJlYWRpbmciLCJnb2FsX2FyZWEiOiJyZWFkaW5nIiwic3lub255bXMiOltdLCJzb3J0IjoxfSx7ImlkIjoiMDE5MDAwMDAtMDAwMC03MDAwLTgwMDAtMDAwMDAwMDAwMDAzIiwicGFyZW50X2lkIjoiMDE5MDAwMDAtMDAwMC03MDAwLTgwMDAtMDAwMDAwMDAwMDAyIiwibGV2ZWwiOiJza2lsbCIsIm5hbWUiOiJQaG9uaWNzIGFuZCBkZWNvZGluZyIsImdvYWxfYXJlYSI6InJlYWRpbmciLCJzeW5vbnltcyI6WyJzb3VuZGluZyBvdXQiXSwic29ydCI6MX1dLCJnb2FscyI6W3siaWQiOiIwMTkwMDAwMC0wMDAwLTcwMDAtODAwMC0wMDAwMDAwMDAwMTAiLCJ2ZXJzaW9uIjoxLCJzdGF0dXMiOiJwdWJsaXNoZWQiLCJ0aWVyIjoic3RhcnRlciIsInNraWxsX2lkcyI6WyIwMTkwMDAwMC0wMDAwLTcwMDAtODAwMC0wMDAwMDAwMDAwMDMiXSwiZ3JhZGVfYmFuZHMiOlsiSy0yIl0sInRpdGxlIjoiRGVjb2RlIENWQyB3b3JkcyIsInRlbXBsYXRlX3RleHQiOiJHaXZlbiBhIGxpc3Qgb2Yge3dvcmRfdHlwZX0gd29yZHMsIHRoZSBzdHVkZW50IHdpbGwgcmVhZCBlYWNoIHdvcmQgYWxvdWQgd2l0aCB7YWNjdXJhY3l9IHBlcmNlbnQgYWNjdXJhY3kgaW4gMyBvZiAzIGNvbnNlY3V0aXZlIHNlc3Npb25zIGJ5IHtkYXRlfS4iLCJjb25kaXRpb25fdGV4dCI6IkdpdmVuIGEgbGlzdCBvZiB7d29yZF90eXBlfSB3b3JkcyIsImJlaGF2aW9yX3RleHQiOiJyZWFkIGVhY2ggd29yZCBhbG91ZCIsInNsb3RzIjpbeyJuYW1lIjoid29yZF90eXBlIiwia2luZCI6ImNob2ljZSIsImNob2ljZXMiOlsiQ1ZDIiwiQ1ZDZSJdLCJkZWZhdWx0IjoiQ1ZDIn1dLCJtZWFzdXJlbWVudF9wbGFuX3RlbXBsYXRlIjp7Im1ldGhvZCI6InRyaWFscyIsInVuaXQiOiJ3b3JkcyIsInRyaWFsc19wZXJfc2Vzc2lvbiI6MTB9LCJtYXN0ZXJ5Ijp7InRocmVzaG9sZCI6ODAsImNvbXBhcmF0b3IiOiI+PSIsIndpbmRvd19raW5kIjoiY29uc2VjdXRpdmUiLCJ3aW5kb3dfY291bnQiOjMsIndpbmRvd19vZiI6MywibWFpbnRlbmFuY2VfY2hlY2siOnRydWV9LCJvYmplY3RpdmVfbGFkZGVyIjpbIlJlYWQgNSBvZiAxMCB3b3JkcyIsIlJlYWQgNyBvZiAxMCB3b3JkcyJdLCJiYXNlbGluZV9ndWlkYW5jZSI6IkdpdmUgdGhyZWUgMS1taW51dGUgcHJvYmVzIGJlZm9yZSB3cml0aW5nIHRoZSBiYXNlbGluZS4iLCJzdGFuZGFyZF9yZWZzIjpbXSwiZGVmaWNpdF90YWdzIjpbInBob25vbG9naWNhbF9wcm9jZXNzaW5nX2xvdyJdLCJyZWxhdGVkX2FjY29tbW9kYXRpb25faWRzIjpbIjAxOTAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDAyMCJdLCJkaXNjaXBsaW5lIjoic3BlZF90ZWFjaGVyIiwicHJvdmVuYW5jZSI6eyJvcmlnaW4iOiJvcmlnaW5hbCIsImF1dGhvciI6InRlc3QgZml4dHVyZSJ9fV0sImFjY29tbW9kYXRpb25zIjpbeyJpZCI6IjAxOTAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDAyMCIsInZlcnNpb24iOjEsInN0YXR1cyI6InB1Ymxpc2hlZCIsInRpZXIiOiJzdGFydGVyIiwia2luZCI6ImFjY29tbW9kYXRpb24iLCJjYXRlZ29yeSI6IlByZXNlbnRhdGlvbiIsInRpdGxlIjoiRGlyZWN0aW9ucyByZWFkIGFsb3VkIiwiZGVzY3JpcHRpb24iOiJTdGFmZiByZWFkIHdyaXR0ZW4gZGlyZWN0aW9ucyBhbG91ZCB0byB0aGUgc3R1ZGVudC4iLCJuZWVkX3RhZ3MiOlsiZGVjb2RpbmdfbG93Il0sInNraWxsX2lkcyI6WyIwMTkwMDAwMC0wMDAwLTcwMDAtODAwMC0wMDAwMDAwMDAwMDMiXSwiZGVmYXVsdF9sZmQiOnsibG9jYXRpb24iOiJhbGwgZ2VuZXJhbCBlZHVjYXRpb24gY2xhc3NlcyIsImZyZXF1ZW5jeSI6ImZvciBldmVyeSB3cml0dGVuIGFzc2lnbm1lbnQiLCJkdXJhdGlvbiI6ImZvciB0aGUgZHVyYXRpb24gb2YgdGhpcyBJRVAifSwicHJvdmVuYW5jZSI6eyJvcmlnaW4iOiJvcmlnaW5hbCIsImF1dGhvciI6InRlc3QgZml4dHVyZSJ9fV0sInBocmFzZXMiOlt7ImlkIjoiMDE5MDAwMDAtMDAwMC03MDAwLTgwMDAtMDAwMDAwMDAwMDMwIiwicGFydCI6ImZyZXF1ZW5jeSIsInRleHQiOiJkYWlseSIsInNsb3RzIjpbXSwic3RhdHVzIjoicHVibGlzaGVkIn1dfQ=="
private let signatureB64 = "m2IspGw/nvy+kZ7Tgq/JeVuOIVVWDIfCS+4MdebQAEsSHfBgGdRXMoP/mqAq0kbJgCFemp04RAW6t+A9u+AQAA=="

/// The envelope, assembled here so the signed bytes stay the single source of truth.
private let fixture: Data = {
    let env: [String: Any] = [
        "format": "demo-starter-bundle", "format_version": 1, "key_id": signerId,
        "algorithm": "ed25519", "payload": payloadB64, "signature": signatureB64,
    ]
    return try! JSONSerialization.data(withJSONObject: env)
}()

@Suite struct StarterBundleTests {
    @Test func decodesContentRegardlessOfPlatform() throws {
        let env = try JSONSerialization.jsonObject(with: fixture) as! [String: Any]
        let bytes = Data(base64Encoded: env["payload"] as! String)!
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let content = try decoder.decode(StarterLibraryContent.self, from: bytes)
        #expect(content.bundleVersion == 7)
        #expect(content.goals.first?.measurementPlanTemplate.method == "trials")
        #expect(content.goals.first?.mastery.windowCount == 3)
        #expect(content.taxonomy.count == 3)
    }

    @Test func hidingRemovesItemsAndDanglingLinks() throws {
        let env = try JSONSerialization.jsonObject(with: fixture) as! [String: Any]
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let content = try decoder.decode(
            StarterLibraryContent.self, from: Data(base64Encoded: env["payload"] as! String)!)
        let accId = content.accommodations[0].id
        let view = content.hiding([accId])
        #expect(view.accommodations.isEmpty)
        #expect(view.goals[0].relatedAccommodationIds.isEmpty)
        #expect(content.accommodations.count == 1)
    }

    #if canImport(CryptoKit)
    @Test func opensWithThePinnedKey() throws {
        let content = try StarterBundle.open(fixture, trustedKeys: [signerId: pinnedPub])
        #expect(content.goals.count == 1)
    }

    @Test func refusesAnUnpinnedKey() {
        #expect(throws: BundleError.unknownKey) {
            try StarterBundle.open(fixture, trustedKeys: ["other": pinnedPub])
        }
    }

    @Test func refusesATamperedPayload() throws {
        var env = try JSONSerialization.jsonObject(with: fixture) as! [String: Any]
        var bytes = Data(base64Encoded: env["payload"] as! String)!
        bytes[bytes.count / 2] ^= 0x01
        env["payload"] = bytes.base64EncodedString()
        let tampered = try JSONSerialization.data(withJSONObject: env)
        #expect(throws: BundleError.signature) {
            try StarterBundle.open(tampered, trustedKeys: [signerId: pinnedPub])
        }
    }

    @Test func refusesAWrongKeyWithTheRightId() {
        let wrong = Data(repeating: 1, count: 32)
        #expect(throws: BundleError.signature) {
            try StarterBundle.open(fixture, trustedKeys: [signerId: wrong])
        }
    }

    @Test func refusesARollback() {
        #expect(throws: BundleError.rollback) {
            try StarterBundle.open(fixture, trustedKeys: [signerId: pinnedPub], installedVersion: 7)
        }
        #expect(throws: Never.self) {
            try StarterBundle.open(fixture, trustedKeys: [signerId: pinnedPub], installedVersion: 6)
        }
    }

    @Test func refusesMalformedInput() {
        #expect(throws: BundleError.format) {
            try StarterBundle.open(Data("{}".utf8), trustedKeys: [signerId: pinnedPub])
        }
    }
    #endif
}
