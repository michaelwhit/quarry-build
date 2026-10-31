import CoreModels
import Foundation
import Testing

@testable import Persistence

@MainActor
@Suite("What's due")
struct WhatsDueTests {
    func makeStore() throws -> PrototypeStore {
        let dataset = try SyntheticDataset.load(
            from: Data(contentsOf: PrototypeStoreTests.fixtureURL))
        let today = LocalDate(year: 2026, month: 10, day: 30)!
        return PrototypeStore(dataset: dataset, today: { today })
    }

    func director() throws -> PrototypeStore {
        let store = try makeStore()
        store.signIn(as: try #require(store.dataset.staff.first { $0.role == .spedDirector }))
        return store
    }

    func day(_ text: String) -> LocalDate { LocalDate(text)! }

    func items(_ view: WhatsDue) -> [DueItem] {
        view.managers.flatMap { $0.overdue + $0.comingUp }
    }

    @Test("only the director opens it; every other role and a signed-out store get nothing")
    func directorOnly() throws {
        for role in StaffRole.allCases {
            let store = try makeStore()
            guard let person = store.dataset.staff.first(where: { $0.role == role }) else {
                continue
            }
            store.signIn(as: person)
            let view = store.whatsDue(today: day("2026-10-30"))
            #expect((view.total > 0) == (role == .spedDirector), "\(role)")
        }
        #expect(try makeStore().whatsDue(today: day("2026-10-30")).total == 0)
    }

    @Test("overdue reports are the same ones the overdue list shows")
    func sameAsOverdueList() throws {
        let store = try director()
        let view = store.whatsDue(today: day("2026-10-30"))
        let reports = view.managers.flatMap(\.overdue).filter { $0.kind == .report }
        #expect(reports.count == store.overdueList(today: day("2026-10-30")).total)
        let allOverdue = reports.allSatisfy { $0.overdue }
        #expect(allOverdue)
    }

    @Test("a report is held back until the first school day after its due date")
    func timing() throws {
        let store = try director()
        // Due Friday Oct 23: coming up over the weekend, overdue on Monday.
        let weekend = items(store.whatsDue(today: day("2026-10-25"))).filter { $0.kind == .report }
        #expect(weekend.count == 6)
        #expect(weekend.allSatisfy { !$0.overdue })
        let monday = items(store.whatsDue(today: day("2026-10-26"))).filter { $0.kind == .report }
        let mondayOverdue = monday.filter { $0.overdue }.count
        #expect(mondayOverdue == 6)
    }

    @Test("IEP dates appear inside the window and a passed date is overdue")
    func iepDates() throws {
        let store = try director()
        let wide = items(store.whatsDue(today: day("2026-10-30"), windowDays: 180))
            .filter { $0.kind != .report }
        #expect(!wide.isEmpty)
        #expect(wide.allSatisfy { $0.dueDate <= day("2027-04-28") })
        // One invented annual review is due 2026-11-24: inside 30 days of Oct 30 and of Nov 16.
        let narrow = items(store.whatsDue(today: day("2026-10-30"), windowDays: 30))
            .filter { $0.kind != .report }
        #expect(narrow.count == 1)
        #expect(narrow.allSatisfy { $0.kind == .annualReview && $0.dueDate == day("2026-11-24") })
        let later = items(store.whatsDue(today: day("2027-03-10"), windowDays: 30))
            .filter { $0.kind == .annualReview }
        #expect(later.contains { $0.overdue && $0.dueDate < day("2027-03-10") })
        #expect(later.contains { !$0.overdue && $0.dueDate >= day("2027-03-10") })
    }

    @Test("students need data once a goal goes more than five school days without a point")
    func dataGaps() throws {
        let store = try director()
        func gaps(_ text: String) -> [DataGap] {
            store.whatsDue(today: day(text)).managers.flatMap(\.needsData)
        }
        #expect(WhatsDue.dataGapSchoolDays == 5)
        // The demo's newest data is Thursday Oct 15.
        #expect(gaps("2026-10-16").isEmpty)
        // Two goals last had data on Oct 13; their sixth school day without is Oct 21.
        #expect(gaps("2026-10-20").isEmpty)
        let partial = gaps("2026-10-21")
        #expect(partial.count == 2)
        #expect(partial.allSatisfy { $0.goalsWithoutData == 1 })
        // Everything else last had data on Oct 15; the sixth school day without is Oct 23.
        let all = gaps("2026-10-23")
        #expect(all.count == 12)
        #expect(all.allSatisfy { $0.goalsWithoutData > 0 && $0.goalsWithoutData <= $0.goalsTotal })
        #expect(all.allSatisfy { $0.lastRecorded == day("2026-10-15") || $0.lastRecorded == day("2026-10-13") })
    }

    @Test("school days count weekends and no-school days out")
    func schoolDays() throws {
        let calendar = try #require(try makeStore().dataset.schoolCalendar)
        #expect(PrototypeStore.schoolDays(after: day("2026-10-23"), through: day("2026-10-26"), calendar: calendar) == 1)
        #expect(PrototypeStore.schoolDays(after: day("2026-10-23"), through: day("2026-10-23"), calendar: calendar) == 0)
        #expect(PrototypeStore.schoolDays(after: day("2026-10-26"), through: day("2026-10-23"), calendar: calendar) == 0)
        // Nov 9 is a no-school day.
        #expect(PrototypeStore.schoolDays(after: day("2026-11-06"), through: day("2026-11-10"), calendar: calendar) == 1)
    }

    @Test("each case manager lists every building on their caseload")
    func buildings() throws {
        let view = try director().whatsDue(today: day("2026-10-30"))
        #expect(!view.managers.isEmpty)
        for manager in view.managers {
            #expect(manager.buildings == ["Prairie Wind Elementary", "Sandhill Middle"])
        }
    }

    @Test("people are named first name and last initial and listed by name, not by count")
    func plainWords() throws {
        let view = try director().whatsDue(today: day("2026-10-30"))
        let names = view.managers.map(\.caseManager)
        #expect(names == names.sorted())
        let pattern = #"^\S+ [A-Z]\.$"#
        for item in items(view) {
            #expect(item.student.range(of: pattern, options: .regularExpression) != nil)
        }
        for gap in view.managers.flatMap(\.needsData) {
            #expect(gap.student.range(of: pattern, options: .regularExpression) != nil)
        }
        #expect(view.total == view.overdueCount + view.comingUpCount + view.needsDataCount)
        #expect(view.total == view.managers.reduce(0) { $0 + $1.count })
    }

    @Test("one audit row per load holds counts and ids only")
    func audit() throws {
        let view = try director().whatsDue(today: day("2026-10-30"))
        let log = WhatsDueAuditLog()
        log.record(view)
        #expect(log.rows.count == 1)
        #expect(log.rows[0].action == "due_view_load")
        #expect(log.rows[0].count == view.total)
        #expect(log.rows[0].itemIDs.count == view.overdueCount + view.comingUpCount)
        #expect(log.rows[0].studentIDs.count == view.needsDataCount)
    }

    @Test("a due date is named only when every item shares it")
    func shared() {
        #expect(WhatsDue.sharedDueDate([day("2026-10-23"), day("2026-10-23")]) == day("2026-10-23"))
        #expect(WhatsDue.sharedDueDate([day("2026-10-23"), day("2026-10-30")]) == nil)
        #expect(WhatsDue.sharedDueDate([]) == nil)
    }
}
