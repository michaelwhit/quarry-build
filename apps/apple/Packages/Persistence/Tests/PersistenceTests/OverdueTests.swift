import CoreModels
import Foundation
import Testing

@testable import Persistence

@MainActor
@Suite("Overdue progress reports")
struct OverdueTests {
    func makeStore() throws -> PrototypeStore {
        let dataset = try SyntheticDataset.load(
            from: Data(contentsOf: PrototypeStoreTests.fixtureURL))
        let today = LocalDate(year: 2026, month: 10, day: 30)!
        return PrototypeStore(dataset: dataset, today: { today })
    }

    func signIn(_ store: PrototypeStore, as role: StaffRole) throws {
        store.signIn(as: try #require(store.dataset.staff.first { $0.role == role }))
    }

    let oct23 = LocalDate("2026-10-23")!
    let oct26 = LocalDate("2026-10-26")!
    let oct30 = LocalDate("2026-10-30")!
    let nov16 = LocalDate("2026-11-16")!

    @Test("the demo district has twelve reports and half are waiting on the phone-demo day")
    func seed() throws {
        let store = try makeStore()
        try signIn(store, as: .spedDirector)
        #expect(store.dataset.progressReports.count == 12)
        #expect(store.overdueCount(today: oct30) == 6)
        #expect(store.overdueCount(today: nov16) == 6)
    }

    @Test("nothing is overdue until the first school day after the due date")
    func timing() throws {
        let store = try makeStore()
        try signIn(store, as: .spedDirector)
        #expect(store.overdueCount(today: oct23) == 0)
        #expect(store.overdueCount(today: LocalDate("2026-10-25")!) == 0)
        #expect(store.overdueCount(today: oct26) == 6)
    }

    @Test("only the director opens it; every other role gets nothing")
    func directorOnly() throws {
        for role in StaffRole.allCases {
            let store = try makeStore()
            guard let person = store.dataset.staff.first(where: { $0.role == role }) else {
                continue
            }
            store.signIn(as: person)
            let expected = role == .spedDirector
            #expect(store.roleView.showsOverdueReports == expected, "\(role)")
            #expect((store.overdueCount(today: oct30) > 0) == expected, "\(role)")
            #expect((store.overdueList(today: oct30).total > 0) == expected, "\(role)")
        }
        let signedOut = try makeStore()
        #expect(signedOut.overdueList(today: oct30) == .empty)
    }

    @Test("the list is grouped by building then case manager and its counts add up")
    func grouping() throws {
        let store = try makeStore()
        try signIn(store, as: .spedDirector)
        let list = store.overdueList(today: oct30)
        #expect(list.total == store.overdueCount(today: oct30))
        let counted = list.buildings.reduce(0) { sum, b in
            sum + b.managers.reduce(0) { $0 + $1.reports.count }
        }
        #expect(counted == list.total)
        #expect(list.buildings.map(\.building) == list.buildings.map(\.building).sorted())
        for building in list.buildings {
            for manager in building.managers {
                let due = manager.reports.map(\.dueDate)
                #expect(due == due.sorted())
            }
        }
    }

    @Test("rows show only waiting reports in plain words, with first name and last initial")
    func rows() throws {
        let store = try makeStore()
        try signIn(store, as: .spedDirector)
        let rows = store.overdueList(today: oct30).buildings.flatMap {
            $0.managers.flatMap(\.reports)
        }
        let waiting = Set(["Not started", "Draft saved", "Approved, ready to copy", "Copied, not yet marked filed"])
        #expect(rows.allSatisfy { waiting.contains($0.words) })
        #expect(rows.allSatisfy { $0.student.range(of: #"^\S+ [A-Z]\.$"#, options: .regularExpression) != nil })
        let filed = Set(
            store.dataset.progressReports.filter { ProgressReportRules.isFiled($0.state) }.map(\.id))
        #expect(rows.allSatisfy { !filed.contains($0.id) })
    }

    @Test("a period filter narrows only the list, never the Home number")
    func period() throws {
        let store = try makeStore()
        try signIn(store, as: .spedDirector)
        let all = store.overdueList(today: oct30)
        #expect(all.periods == ["Quarter 1"])
        #expect(store.overdueList(today: oct30, period: "Quarter 1").total == store.overdueCount(today: oct30))
        #expect(store.overdueList(today: oct30, period: "Quarter 9").total == 0)
    }

    @Test("one audit row per list load holds counts and ids only")
    func audit() throws {
        let store = try makeStore()
        try signIn(store, as: .spedDirector)
        let log = OverdueAuditLog()
        let list = store.overdueList(today: oct30)
        log.record(list)
        #expect(log.rows.count == 1)
        #expect(log.rows[0].count == 6)
        #expect(log.rows[0].reportIDs.count == 6)
        #expect(log.rows[0].action == "overdue_list_load")
    }

    @Test("a file with no calendar or reports gives an empty list")
    func oldFile() throws {
        var dataset = try SyntheticDataset.load(
            from: Data(contentsOf: PrototypeStoreTests.fixtureURL))
        dataset.progressReports = []
        dataset.schoolCalendar = nil
        let store = PrototypeStore(dataset: dataset, today: { LocalDate("2026-10-30")! })
        try signIn(store, as: .spedDirector)
        #expect(store.overdueList(today: oct30) == .empty)
        #expect(store.overdueCount(today: oct30) == 0)
    }
}
