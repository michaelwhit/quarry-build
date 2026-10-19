import Foundation
import Testing

@testable import FeatureLibrary
import StarterLibrary

@Suite struct LibraryIndexTests {
    @Test func emptySearchListsEverythingByTitle() throws {
        let index = try Fixture.index()
        let titles = index.goals(matching: "").map(\.title)
        #expect(titles.count == 4)
        #expect(titles == titles.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending })
    }

    @Test func phonicsFindsDecodingThroughSynonyms() throws {
        let index = try Fixture.index()
        let found = index.goals(matching: "phonics").map(\.id)
        #expect(found.contains(Fixture.cvc))
        #expect(!found.contains(Fixture.pencil))
    }

    @Test func taxonomySynonymsFindTheSkill() throws {
        let index = try Fixture.index()
        #expect(index.goals(matching: "sounding out").map(\.id).contains(Fixture.cvc))
    }

    @Test func otFindsFineMotorButNotTheWordOther() throws {
        let index = try Fixture.index()
        let found = index.goals(matching: "OT").map(\.id)
        #expect(found.contains(Fixture.pencil))
        #expect(!found.contains(Fixture.cvc))
        // A two-letter word must be a whole word: "ot" does not find "other".
        #expect(LibraryIndex.score([["ot"]], in: "another other", title: "x") == nil)
    }

    @Test func everyTypedWordMustMatch() throws {
        let index = try Fixture.index()
        #expect(index.goals(matching: "decode cvc").map(\.id) == [Fixture.cvc])
        #expect(index.goals(matching: "decode keyboard").isEmpty)
    }

    @Test func titleHitsRankAboveBodyHits() throws {
        let index = try Fixture.index()
        // "words" is in the title of nothing but the body of several; "pencil" is a title hit.
        let ranked = index.goals(matching: "pencil").map(\.id)
        #expect(ranked.first == Fixture.pencil)
    }

    @Test func chipsAreOrWithinAGroupAndAcrossGroups() throws {
        let index = try Fixture.index()
        let either = index.goals(matching: "", filters: GoalFilters(gradeBands: ["K-2", "9-12"]))
        #expect(Set(either.map(\.id)) == [Fixture.cvc, Fixture.pencil, Fixture.other])
        let both = index.goals(matching: "", filters: GoalFilters(gradeBands: ["K-2"], disciplines: ["ot"]))
        #expect(both.map(\.id) == [Fixture.pencil])
        let none = index.goals(matching: "", filters: GoalFilters(areas: ["reading"], disciplines: ["ot"]))
        #expect(none.isEmpty)
    }

    @Test func areaComesFromTheSkillNode() throws {
        let index = try Fixture.index()
        #expect(index.availableAreas == ["motor", "reading"])
        let cvc = try #require(index.goal(id: Fixture.cvc))
        #expect(index.area(of: cvc) == "reading")
    }

    @Test func gradeBandsInTeacherOrder() throws {
        #expect(try Fixture.index().availableGradeBands == ["K-2", "3-5", "6-8", "9-12"])
    }

    @Test func treeNodeFiltersToItsSubtree() throws {
        let index = try Fixture.index()
        let reading = index.goals(matching: "", filters: GoalFilters(taxonomyNodeId: Fixture.reading))
        #expect(Set(reading.map(\.id)) == [Fixture.cvc, Fixture.fluency])
        let domain = index.goals(matching: "", filters: GoalFilters(taxonomyNodeId: Fixture.motorDomain))
        #expect(Set(domain.map(\.id)) == [Fixture.pencil, Fixture.other])
    }

    @Test func taxonomyRowsAreDepthFirstWithCounts() throws {
        let rows = try Fixture.index().taxonomyRows()
        #expect(rows.map(\.node.name) == ["Academic", "Reading", "Phonics and decoding", "Functional", "Fine motor"])
        #expect(rows.map(\.depth) == [0, 1, 2, 0, 1])
        #expect(rows.map(\.goalCount) == [2, 2, 2, 2, 2])
    }

    @Test func pathNamesTheAncestors() throws {
        #expect(try Fixture.index().path(toNode: Fixture.phonics) == "Academic › Reading › Phonics and decoding")
    }

    @Test func accommodationsSearchAndFilterByCategory() throws {
        let index = try Fixture.index()
        #expect(index.accommodations(matching: "aloud").map(\.id) == [Fixture.readAloud])
        #expect(index.accommodations(matching: "", categories: ["Timing"]).map(\.id) == [Fixture.timer])
        #expect(index.accommodationCategories == ["Presentation", "Timing"])
    }

    @Test func hiddenItemsLeaveBrowsing() throws {
        let content = try StarterBundle.decodeUnverified(payload: Data(Fixture.json.utf8)).hiding([Fixture.cvc])
        let index = LibraryIndex(content)
        #expect(!index.goals(matching: "").map(\.id).contains(Fixture.cvc))
    }
}

@Suite struct GoalTemplateTextTests {
    @Test func splitsTextSlotsAndNumbers() {
        let parts = GoalTemplateText.segments("Given {word_type} words, {student} reads {80}% by {date}.")
        #expect(
            parts == [
                .text("Given "), .slot("word_type"), .text(" words, "), .slot("student"), .text(" reads "),
                .number("80"), .text("% by "), .slot("date"), .text("."),
            ])
    }

    @Test func unmatchedBraceIsPlainText() {
        #expect(GoalTemplateText.segments("a { b") == [.text("a { b")])
        #expect(GoalTemplateText.segments("{}") == [.text("{}")])
    }

    @Test func previewBracketsSlotsAndNeverInventsAName() {
        let line = GoalTemplateText.preview("Given {word_type} words, {student} reads {80}% by {date}.")
        #expect(line == "Given [word type] words, the student reads 80% by [date].")
    }

    @Test func slotNamesSkipStudentAndRepeats() {
        #expect(GoalTemplateText.slotNames("{student} {a} {a} {b} {95}") == ["a", "b"])
    }

    @Test func masteryLineReadsInPlainWords() throws {
        let index = try Fixture.index()
        let cvc = try #require(index.goal(id: Fixture.cvc))
        #expect(LibraryText.masteryLine(cvc.mastery) == "At or above 80%, 3 times in a row, then a later check that it lasts")
        let fluency = try #require(index.goal(id: Fixture.fluency))
        #expect(
            LibraryText.masteryLine(fluency.mastery)
                == "At or above the [target] you choose, 3 of the last 4 checks")
    }

    @Test func provenanceSaysWhenNotReviewed() throws {
        let index = try Fixture.index()
        let cvc = try #require(index.goal(id: Fixture.cvc))
        let fluency = try #require(index.goal(id: Fixture.fluency))
        #expect(LibraryText.provenanceLine(cvc.provenance).contains("not yet reviewed"))
        #expect(LibraryText.provenanceLine(fluency.provenance).contains("A. Reviewer"))
    }

    @Test func unknownLabelsNeverShowUnderscores() {
        #expect(LibraryLabels.method("new_method") == "New method")
        #expect(LibraryLabels.discipline("sped_teacher") == "Special education teacher")
    }
}
