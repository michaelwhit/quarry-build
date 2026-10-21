import Foundation
import Testing

@testable import CoreModels

/// Runs the shared answer key (packages/synthetic-data/vectors/progress-reports.json) against the
/// Swift copy of the overdue rule, the same file the TypeScript copy is checked with.
@Suite("Progress report rules")
struct ProgressReportRulesTests {
    struct Vectors: Decodable {
        struct Calendar: Decodable { let noSchoolDays: [String] }
        struct NextCase: Decodable {
            let name: String
            let after: String
            let next: String
        }
        struct Case: Decodable {
            let name: String
            let state: String
            let dueDate: String
            let today: String
            let firstOverdueDay: String
            let overdue: Bool
            let daysOverdue: Int
        }
        let calendar: Calendar
        let stateLabels: [String: String?]
        let nextSchoolDayCases: [NextCase]
        let cases: [Case]
    }

    static let vectors: Vectors = {
        let url = repoRoot.appendingPathComponent(
            "packages/synthetic-data/vectors/progress-reports.json")
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try! decoder.decode(Vectors.self, from: Data(contentsOf: url))
    }()

    static let calendar = SchoolCalendar(
        schoolYear: "2026-27", noSchoolDays: vectors.calendar.noSchoolDays.map { LocalDate($0)! })

    @Test("every case in the answer key")
    func cases() throws {
        #expect(!Self.vectors.cases.isEmpty)
        for item in Self.vectors.cases {
            let state = try #require(ProgressReportState(rawValue: item.state), "\(item.name)")
            let status = ProgressReportRules.status(
                state: state, dueDate: LocalDate(item.dueDate)!, today: LocalDate(item.today)!,
                calendar: Self.calendar)
            #expect(status.overdue == item.overdue, "\(item.name)")
            #expect(status.daysOverdue == item.daysOverdue, "\(item.name)")
            #expect(status.firstOverdueDay.description == item.firstOverdueDay, "\(item.name)")
        }
    }

    @Test("the next school day skips weekends, breaks and staff days")
    func nextSchoolDay() {
        for item in Self.vectors.nextSchoolDayCases {
            let next = ProgressReportRules.nextSchoolDay(
                after: LocalDate(item.after)!, calendar: Self.calendar)
            #expect(next.description == item.next, "\(item.name)")
        }
    }

    @Test("the words for each state match the answer key and filed states have none")
    func words() {
        for state in ProgressReportState.allCases {
            let expected = Self.vectors.stateLabels[state.rawValue] ?? nil
            #expect(ProgressReportRules.waitingLabel(state) == expected, "\(state)")
            #expect(ProgressReportRules.isFiled(state) == (expected == nil))
        }
    }

    @Test("day numbers round-trip and know weekends")
    func dayNumbers() {
        let friday = LocalDate("2026-10-23")!
        #expect(!friday.isWeekend)
        #expect(LocalDate(dayNumber: friday.dayNumber + 1).isWeekend)
        #expect(LocalDate(dayNumber: friday.dayNumber).description == "2026-10-23")
        #expect(LocalDate(dayNumber: 0).description == "1970-01-01")
    }
}
