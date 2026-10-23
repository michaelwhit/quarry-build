import CoreModels
import Foundation

/// What kind of thing is due.
public enum DueKind: Equatable, Sendable {
    case report, annualReview, reevaluation
}

/// One progress report or IEP date, as the director's "What's due" screen lists it.
public struct DueItem: Identifiable, Equatable, Sendable {
    public let id: String
    public let studentID: UUID
    /// First name and last initial only.
    public let student: String
    public let kind: DueKind
    /// What it is, in plain words ("Quarter 1 progress report").
    public let what: String
    public let dueDate: LocalDate
    /// True when the date has passed (reports: the first school day after it has come).
    public let overdue: Bool
}

/// A student with goals that have gone more than `WhatsDue.dataGapSchoolDays` school days without a
/// data point. Describes the records, never the person who records them.
public struct DataGap: Identifiable, Equatable, Sendable {
    public let studentID: UUID
    public let student: String
    public let goalsWithoutData: Int
    public let goalsTotal: Int
    /// The day of the newest data point on any of the student's goals, or nil if there is none.
    public let lastRecorded: LocalDate?
    public var id: UUID { studentID }
}

public struct DueCaseManager: Identifiable, Equatable, Sendable {
    public let caseManager: String
    /// Every building where the case manager has students on the caseload, sorted by name.
    public let buildings: [String]
    public let overdue: [DueItem]
    public let comingUp: [DueItem]
    public let needsData: [DataGap]
    public var id: String { caseManager }
    public var count: Int { overdue.count + comingUp.count + needsData.count }
}

public struct WhatsDue: Equatable, Sendable {
    /// How many school days without a data point before a goal is listed.
    public static let dataGapSchoolDays = 5
    /// How far ahead "coming up" looks, in days. The first is the screen's default.
    public static let windows = [180, 90, 60, 30]

    public let today: LocalDate
    public let windowDays: Int
    /// People are listed by name, not ranked or scored.
    public let managers: [DueCaseManager]

    public var overdueCount: Int { managers.reduce(0) { $0 + $1.overdue.count } }
    public var comingUpCount: Int { managers.reduce(0) { $0 + $1.comingUp.count } }
    public var needsDataCount: Int { managers.reduce(0) { $0 + $1.needsData.count } }
    public var total: Int { overdueCount + comingUpCount + needsDataCount }

    public static let empty = WhatsDue(today: LocalDate(dayNumber: 0), windowDays: 180, managers: [])

    /// The one due date every item shares, or nil when they differ (or there are none).
    public static func sharedDueDate(_ dates: [LocalDate]) -> LocalDate? {
        guard let first = dates.first, dates.allSatisfy({ $0 == first }) else { return nil }
        return first
    }
}

/// What one load leaves in the audit trail: counts and ids only, never names or text.
public struct WhatsDueAuditRow: Equatable, Sendable {
    public let action = "due_view_load"
    public let count: Int
    public let itemIDs: [String]
    public let studentIDs: [UUID]
}

/// The audit rows the screen wrote. A reference type so a screen can record without changing the
/// store.
@MainActor
public final class WhatsDueAuditLog {
    public private(set) var rows: [WhatsDueAuditRow] = []
    public init() {}
    public func record(_ view: WhatsDue) {
        rows.append(
            WhatsDueAuditRow(
                count: view.total,
                itemIDs: view.managers.flatMap { ($0.overdue + $0.comingUp).map(\.id) },
                studentIDs: view.managers.flatMap { $0.needsData.map(\.studentID) }))
    }
}

extension PrototypeStore {
    /// What is overdue, what is coming up within `windowDays` and which students need data
    /// recorded, for each case manager. Empty for anyone but the director.
    public func whatsDue(today: LocalDate, windowDays: Int = WhatsDue.windows[0]) -> WhatsDue {
        guard roleView.showsOverdueReports, let calendar = dataset.schoolCalendar else {
            return WhatsDue(today: today, windowDays: windowDays, managers: [])
        }
        let until = LocalDate(dayNumber: today.dayNumber + windowDays)
        let students = Dictionary(uniqueKeysWithValues: allStudents.map { ($0.id, $0) })

        // The case manager each student is with today (the first caseload assignment wins).
        var holder: [UUID: UUID] = [:]
        for a in dataset.caseloadAssignments + addedAssignments
        where a.relationship == .caseload && a.isActive(on: today) && holder[a.studentID] == nil {
            holder[a.studentID] = a.staffID
        }
        var buildings: [UUID: Set<String>] = [:]
        for (studentID, staffID) in holder {
            if let school = students[studentID].flatMap({ school(for: $0) }) {
                buildings[staffID, default: []].insert(
                    school.name.replacingOccurrences(of: " (synthetic)", with: ""))
            }
        }
        func shortName(_ s: Student) -> String {
            "\(s.firstName)\(s.lastName.first.map { " \($0)." } ?? "")"
        }

        var overdue: [UUID: [DueItem]] = [:]
        var comingUp: [UUID: [DueItem]] = [:]
        var needsData: [UUID: [DataGap]] = [:]
        func add(_ item: DueItem, to staffID: UUID) {
            if item.overdue {
                overdue[staffID, default: []].append(item)
            } else {
                comingUp[staffID, default: []].append(item)
            }
        }

        let ieps = Dictionary(uniqueKeysWithValues: allIEPs.map { ($0.id, $0) })
        let periods = Dictionary(uniqueKeysWithValues: dataset.reportingPeriods.map { ($0.id, $0) })
        for report in dataset.progressReports {
            guard let iep = ieps[report.iepID], let student = students[iep.studentID],
                let staffID = holder[student.id], let period = periods[report.reportingPeriodID]
            else { continue }
            let status = ProgressReportRules.status(
                state: report.state, dueDate: report.dueDate, today: today, calendar: calendar)
            if status.filed { continue }
            // Each school has its own record for the same quarter; the quarter is the key.
            let rank =
                dataset.reportingPeriods
                .filter { $0.schoolID == period.schoolID }
                .sorted { $0.srsReportDate < $1.srsReportDate }
                .firstIndex { $0.id == period.id }.map { $0 + 1 } ?? 1
            let item = DueItem(
                id: report.id.uuidString, studentID: student.id, student: shortName(student),
                kind: .report, what: "Quarter \(rank) progress report", dueDate: report.dueDate,
                overdue: status.overdue)
            if status.overdue || report.dueDate <= until { add(item, to: staffID) }
        }

        for iep in allIEPs {
            guard let student = students[iep.studentID], let staffID = holder[student.id] else {
                continue
            }
            let dates: [(kind: DueKind, key: String, what: String, date: LocalDate?)] = [
                (.annualReview, "annual_review", "Annual IEP review", iep.annualReviewDue),
                (.reevaluation, "reevaluation", "Reevaluation", iep.reevaluationDue),
            ]
            for entry in dates {
                guard let due = entry.date, due <= until else { continue }
                add(
                    DueItem(
                        id: "\(iep.id.uuidString):\(entry.key)", studentID: student.id,
                        student: shortName(student), kind: entry.kind, what: entry.what,
                        dueDate: due, overdue: due < today),
                    to: staffID)
            }
        }

        var lastDay: [UUID: LocalDate] = [:]
        for p in dataset.dataPoints + addedPoints {
            let day = PrototypeStore.localDay(of: p.observedAt)
            if lastDay[p.goalID].map({ day > $0 }) ?? true { lastDay[p.goalID] = day }
        }
        for iep in allIEPs {
            guard let student = students[iep.studentID], let staffID = holder[student.id] else {
                continue
            }
            let mine = allGoals.filter { $0.iepID == iep.id }
            let stale = mine.filter { goal in
                guard let at = lastDay[goal.id] else { return true }
                return PrototypeStore.schoolDays(after: at, through: today, calendar: calendar)
                    > WhatsDue.dataGapSchoolDays
            }
            if stale.isEmpty { continue }
            needsData[staffID, default: []].append(
                DataGap(
                    studentID: student.id, student: shortName(student),
                    goalsWithoutData: stale.count, goalsTotal: mine.count,
                    lastRecorded: mine.compactMap { lastDay[$0.id] }.max()))
        }

        let byDate: (DueItem, DueItem) -> Bool = {
            ($0.dueDate, $0.student) < ($1.dueDate, $1.student)
        }
        let managers = Set(overdue.keys).union(comingUp.keys).union(needsData.keys)
            .map { staffID in
                DueCaseManager(
                    caseManager: staffName(staffID),
                    buildings: (buildings[staffID] ?? []).sorted(),
                    overdue: (overdue[staffID] ?? []).sorted(by: byDate),
                    comingUp: (comingUp[staffID] ?? []).sorted(by: byDate),
                    needsData: (needsData[staffID] ?? []).sorted { $0.student < $1.student })
            }
            .sorted { $0.caseManager < $1.caseManager }
        return WhatsDue(today: today, windowDays: windowDays, managers: managers)
    }

    /// School days after `from`, up to and including `through`; 0 when `through` is not after it.
    static func schoolDays(after from: LocalDate, through to: LocalDate, calendar: SchoolCalendar)
        -> Int
    {
        guard from.dayNumber < to.dayNumber else { return 0 }
        return ((from.dayNumber + 1)...to.dayNumber).filter {
            ProgressReportRules.isSchoolDay(LocalDate(dayNumber: $0), calendar: calendar)
        }.count
    }

    /// The date on the clock where the person is (not the UTC date).
    static func localDay(of date: Date) -> LocalDate {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return LocalDate(year: parts.year ?? 1970, month: parts.month ?? 1, day: parts.day ?? 1)
            ?? LocalDate(dayNumber: 0)
    }
}
