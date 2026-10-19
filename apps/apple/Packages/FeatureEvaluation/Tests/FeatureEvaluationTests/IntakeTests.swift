import Foundation
import Testing

@testable import FeatureEvaluation

@MainActor
@Suite("Evidence intake")
struct IntakeTests {
    func intake() -> EvidenceIntake {
        let intake = EvidenceIntake(names: ["Zeke"])
        intake.instrument = "Acadience ORF"
        intake.rows[0].measure = "Reading Fluency"
        intake.rows[0].value = "44"
        intake.rows[0].scoreType = .cbm
        return intake
    }

    @Test("an empty intake cannot be confirmed")
    func empty() {
        let intake = EvidenceIntake()
        #expect(intake.blockers == ["Add at least one score or some text."])
        #expect(!intake.confirm())
        #expect(!intake.isConfirmed)
    }

    @Test("a typed score appears in the preview and confirms")
    func confirms() {
        let intake = intake()
        #expect(intake.preview.count == 1)
        #expect(intake.preview[0].text == "Reading Fluency (Acadience ORF): curriculum-based measure 44")
        #expect(intake.confirm())
        #expect(intake.isConfirmed)
        #expect(intake.confirmedItems?.count == 1)
    }

    @Test("editing after confirming makes the check stale")
    func stale() {
        let intake = intake()
        intake.confirm()
        intake.summary = "Zeke needs help with fluency."
        #expect(!intake.isConfirmed)
        #expect(intake.confirmedItems == nil)
        #expect(intake.preview.last?.text == "[name] needs help with fluency.")
        #expect(intake.confirm())
    }

    @Test("a held-back line blocks confirming until it is reworded")
    func heldBack() {
        let intake = intake()
        intake.recommendations = "Eligible under the primary disability category."
        #expect(intake.withheldCount == 1)
        #expect(!intake.confirm())
        intake.recommendations = "Practice repeated reading each day."
        #expect(intake.confirm())
    }

    @Test("score problems are reported")
    func problems() {
        let intake = intake()
        intake.rows[0].value = "forty"
        intake.rows[0].percentile = "120"
        #expect(intake.rowProblems.count == 2)
        #expect(!intake.confirm())
    }

    @Test("clearing resets everything")
    func clears() {
        let intake = intake()
        intake.confirm()
        intake.clear()
        #expect(!intake.isConfirmed)
        #expect(intake.preview.isEmpty)
        #expect(intake.rows.count == 1)
    }

    @Test("removing the last row leaves one blank row")
    func removeLast() {
        let intake = intake()
        intake.removeRows(at: IndexSet(integer: 0))
        #expect(intake.rows.count == 1)
        #expect(intake.rows[0].isBlank)
    }
}
