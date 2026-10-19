import Testing

@testable import FeatureEvaluation

@Suite("Redactor")
struct RedactorTests {
    let roster = ["Zeke", "Larsen", "Zeke Larsen", "Ms. Park"]

    @Test("replaces names as whole words, longest first")
    func replacesNames() {
        let result = EvidenceRedactor.redact(
            "Zeke Larsen reads well. zeke tried; maximum effort. Ms. Park gave the test.", names: roster)
        #expect(!result.text.lowercased().contains("zeke"))
        #expect(!result.text.lowercased().contains("larsen"))
        #expect(!result.text.contains("Ms. Park"))
        #expect(result.text.contains("maximum"))
        #expect(result.replaced["names"] == 3)
    }

    @Test("a short name does not damage longer words")
    func shortName() {
        let result = EvidenceRedactor.redact("Max read the maximum.", names: ["Max"])
        #expect(result.text == "[name] read the maximum.")
    }

    @Test("dates, phones, emails and long numbers are replaced")
    func details() {
        // The phone is built from parts so no phone-shaped literal sits in the file.
        let phone = ["402", "555", "0123"].joined(separator: "-")
        let text = "Tested 3/14/2026 and March 5, 2026 and 2026-03-09. Call \(phone) or a@example.org. ID 12345678."
        let result = EvidenceRedactor.redact(text, names: [])
        #expect(result.text.contains("[date]"))
        #expect(result.text.contains("[phone]"))
        #expect(result.text.contains("[email]"))
        #expect(result.text.contains("[number]"))
        #expect(result.replaced["dates"] == 3)
        #expect(!result.text.contains("2026"))
    }

    @Test("scores are left alone")
    func scoresStay() {
        let result = EvidenceRedactor.redact("Standard score 85, percentile 16, 44 words per minute.", names: [])
        #expect(result.text == "Standard score 85, percentile 16, 44 words per minute.")
        #expect(result.replaced.isEmpty)
        #expect(!result.isWithheld)
    }

    @Test("identifying or eligibility lines are held back")
    func withheld() {
        for text in [
            "Date of birth is in the header.", "The student is eligible under the primary disability category.",
            "Home address on file.",
        ] {
            #expect(EvidenceRedactor.redact(text, names: []).isWithheld)
        }
        #expect(!EvidenceRedactor.redact("Goals should address reading fluency.", names: []).isWithheld)
    }

    @Test("pasted text splits into non-empty lines")
    func paragraphs() {
        #expect(EvidenceRedactor.paragraphs("a\n\n  b  \n") == ["a", "b"])
    }
}
