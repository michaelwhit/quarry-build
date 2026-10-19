import Foundation
import Testing

@testable import FeatureImport

struct ImportPlanTests {
    let north = SchoolChoice(id: UUID(), name: "North Elementary (synthetic)")
    let south = SchoolChoice(id: UUID(), name: "South Middle (synthetic)")

    @Test func detectsCommonHeaders() {
        let mapping = ColumnMapping.detect(headers: ["Student_ID", "First Name", "last-name", "Grade Level", "School"])
        #expect(mapping.columns[.firstName] == 1)
        #expect(mapping.columns[.lastName] == 2)
        #expect(mapping.columns[.grade] == 3)
        #expect(mapping.columns[.school] == 4)
        #expect(mapping.columns[.preferredName] == nil)
        #expect(mapping.isComplete)
        #expect(!ColumnMapping.detect(headers: ["Name"]).isComplete)
    }

    @Test func normalizesGrades() {
        #expect(ImportPlanner.normalizedGrade("3rd") == "3")
        #expect(ImportPlanner.normalizedGrade("Grade 03") == "3")
        #expect(ImportPlanner.normalizedGrade(" kindergarten ") == "K")
        #expect(ImportPlanner.normalizedGrade("Pre-K") == "PK")
        #expect(ImportPlanner.normalizedGrade("12") == "12")
        #expect(ImportPlanner.normalizedGrade("13") == nil)
        #expect(ImportPlanner.normalizedGrade("0") == nil)
        #expect(ImportPlanner.normalizedGrade("") == nil)
        #expect(ImportPlanner.normalizedGrade("five") == nil)
    }

    private func plan(_ text: String, defaultSchool: UUID? = nil, existing: [KnownStudent] = []) throws -> ImportPlan {
        let table = try CsvReader.parse(text)
        return ImportPlanner.plan(
            table: table, mapping: .detect(headers: table.headers), schools: [north, south],
            defaultSchoolID: defaultSchool, existing: existing)
    }

    @Test func readyRowsUseTheDefaultSchool() throws {
        let result = try plan("First,Last,Grade\nAva,Stone,3\nBen,Reed,K\n", defaultSchool: north.id)
        #expect(result.readyCount == 2)
        #expect(result.rows.map(\.schoolID) == [north.id, north.id])
        #expect(result.rows.map(\.id) == [2, 3])
    }

    @Test func schoolColumnWinsAndUnknownSchoolIsAProblem() throws {
        let result = try plan(
            "First,Last,Grade,School\nAva,Stone,3,South Middle\nBen,Reed,4,Nowhere High\n", defaultSchool: north.id)
        #expect(result.rows[0].schoolID == south.id)
        #expect(result.rows[1].status == .problem("School \"Nowhere High\" is not on the list."))
    }

    @Test func missingPiecesAreProblemsInPlainWords() throws {
        let result = try plan("First,Last,Grade\n,Stone,3\nAva,,3\nBen,Reed,\nCal,Dunn,13\n", defaultSchool: north.id)
        #expect(result.problemCount == 4)
        #expect(result.rows[0].status == .problem("No first name."))
        #expect(result.rows[1].status == .problem("No last name."))
        #expect(result.rows[2].status == .problem("No grade."))
        #expect(result.rows[3].status == .problem("Grade \"13\" is not one of PK, K or 1 to 12."))
    }

    @Test func noSchoolAnywhereIsAProblem() throws {
        let result = try plan("First,Last,Grade\nAva,Stone,3\n")
        #expect(result.rows[0].status == .problem("No school. Choose one for the whole file."))
    }

    @Test func repeatsInTheFileAndOnTheListAreSkipped() throws {
        let known = [KnownStudent(firstName: "Ava", lastName: "Stone", grade: "3")]
        let result = try plan(
            "First,Last,Grade\nava,STONE,3rd\nBen,Reed,4\nben,reed,4\nBen,Reed,5\n", defaultSchool: north.id,
            existing: known)
        #expect(result.rows.map(\.status) == [.duplicate, .ready, .duplicate, .ready])
        #expect(result.duplicateCount == 2)
        #expect(result.readyCount == 2)
    }

    @Test func overlongNamesAreProblems() throws {
        let long = String(repeating: "a", count: ImportPlanner.maxNameLength + 1)
        let result = try plan("First,Last,Grade\n\(long),Stone,3\n", defaultSchool: north.id)
        #expect(result.problemCount == 1)
    }
}
