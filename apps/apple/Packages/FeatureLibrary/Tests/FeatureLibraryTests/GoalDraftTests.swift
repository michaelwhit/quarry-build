import Foundation
import Testing

import StarterLibrary

@testable import FeatureLibrary

@Suite struct GoalDraftTests {
    private let today = Date(timeIntervalSince1970: 1_792_000_000)  // fixed so no test reads the clock

    private func draft(_ id: String, student: String? = nil) throws -> GoalDraft {
        let goal = try #require(try Fixture.index().goal(id: id))
        return GoalDraft(template: goal, studentName: student)
    }

    @Test func choiceSlotStartsAtItsDefault() throws {
        let d = try draft(Fixture.cvc)
        #expect(d.value("word_type") == "CVC")
    }

    @Test func formSlotsFollowTheWordingAndSkipTheStudent() throws {
        let d = try draft(Fixture.cvc)
        #expect(d.formSlots.map(\.name) == ["word_type", "date"])
        #expect(d.formSlots.map(\.kind) == ["choice", "date"])
    }

    @Test func previewUsesNeutralStandInUntilANameIsGiven() throws {
        #expect(try draft(Fixture.cvc).renderedText().contains("the student will"))
        #expect(try draft(Fixture.cvc, student: "Sam Example").renderedText().contains("Sam Example will"))
    }

    @Test func emptySlotsShowAsBracketedWords() throws {
        let text = try draft(Fixture.fluency).renderedText()
        #expect(text.contains("[target]"))
        #expect(text.contains("[date]"))
    }

    @Test func typingUpdatesThePreview() throws {
        var d = try draft(Fixture.fluency)
        d.values["target"] = " 90 "
        #expect(d.renderedText().contains("read 90 words correct"))
        let filled = d.pieces().contains(.filled(slot: "target", value: "90"))
        #expect(filled)
    }

    @Test func untouchedGoalFailsSlotAndDateChecks() throws {
        let checks = try draft(Fixture.fluency).checks(today: today)
        func status(_ id: String) -> MeasurabilityCheck.Status? { checks.first { $0.id == id }?.status }
        #expect(status("slots") == .fail)
        #expect(status("date") == .fail)
        #expect(status("criterion") == .fail)  // target comes from a slot still empty
        #expect(status("condition") == .pass)
        #expect(status("observable") == .pass)
        #expect(status("method") == .pass)
    }

    @Test func fillingEverythingMakesItReady() throws {
        var d = try draft(Fixture.fluency)
        d.values["target"] = "90"
        d.dates["date"] = today.addingTimeInterval(86_400 * 120)
        #expect(d.isReady(today: today))
    }

    @Test func aPastDateFails() throws {
        var d = try draft(Fixture.fluency)
        d.values["target"] = "90"
        d.dates["date"] = today.addingTimeInterval(-86_400 * 30)
        let check = try #require(d.checks(today: today).first { $0.id == "date" })
        #expect(check.status == .fail)
        #expect(check.fix == "That date has already passed.")
    }

    @Test func targetMustBeANumberAboveZero() throws {
        var d = try draft(Fixture.fluency)
        d.values["target"] = "lots"
        #expect(d.checks(today: today).first { $0.id == "criterion" }?.status == .fail)
        d.values["target"] = "0"
        #expect(d.checks(today: today).first { $0.id == "criterion" }?.status == .fail)
        d.values["target"] = "75"
        #expect(d.checks(today: today).first { $0.id == "criterion" }?.status == .pass)
    }

    @Test func vagueVerbIsNotObservable() throws {
        let template = try Fixture.goal(Fixture.cvc, changing: ["behavior_text": "understand phonics"])
        let d = GoalDraft(template: template)
        let check = try #require(d.checks(today: today).first { $0.id == "observable" })
        #expect(check.status == .fail)
        #expect(check.fix?.contains("understand") == true)
    }

    @Test func blockedFrequencyInFreeTextFails() throws {
        let template = try Fixture.goal(
            Fixture.cvc,
            changing: [
                "template_text": "{student} will practice {when} by {date}.",
                "slots": [["name": "when", "kind": "text"], ["name": "date", "kind": "date"]],
            ])
        var d = GoalDraft(template: template)
        d.values["when"] = "As-needed"
        #expect(d.checks(today: today).first { $0.id == "frequency" }?.status == .fail)
        d.values["when"] = "twice a week"
        #expect(d.checks(today: today).first { $0.id == "frequency" } == nil)
    }

    @Test func slotNamedInWordingButNotDeclaredStillGetsAField() throws {
        let template = try Fixture.goal(
            Fixture.cvc, changing: ["template_text": "{student} will read {thing} by {date}.", "slots": []])
        let d = GoalDraft(template: template)
        #expect(d.formSlots.map(\.name) == ["thing", "date"])
        #expect(d.formSlots.map(\.kind) == ["text", "date"])
    }
}
