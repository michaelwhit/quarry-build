import CoreModels
import Foundation

/// One progress report that is waiting past its due date, as the director's list shows it.
public struct OverdueReport: Identifiable, Equatable, Sendable {
    public let id: UUID
    public let studentID: UUID
    /// First name and last initial only.
    public let student: String
    public let grade: String
    /// "Quarter 1" and so on.
    public let periodLabel: String
    public let dueDate: LocalDate
    /// Where it stands, in plain words ("Draft saved").
    public let words: String
}

public struct OverdueCaseManagerGroup: Identifiable, Equatable, Sendable {
    public let caseManager: String
    public let reports: [OverdueReport]
    public var id: String { caseManager }
}

public struct OverdueBuildingGroup: Identifiable, Equatable, Sendable {
    public let building: String
    public let managers: [OverdueCaseManagerGroup]
    public var id: String { building }
}

public struct OverdueList: Equatable, Sendable {
    public let total: Int
    public let buildings: [OverdueBuildingGroup]
    /// Periods that have something waiting, newest first.
    public let periods: [String]

    public static let empty = OverdueList(total: 0, buildings: [], periods: [])

    public var reportIDs: [UUID] {
        buildings.flatMap { $0.managers.flatMap { $0.reports.map(\.id) } }
    }
}

/// What one list load leaves in the audit trail: counts and ids only, never names or text.
public struct OverdueAuditRow: Equatable, Sendable {
    public let action = "overdue_list_load"
    public let count: Int
    public let reportIDs: [UUID]
}

/// The audit rows the overdue view wrote. A reference type so a screen can record without
/// changing the store.
@MainActor
public final class OverdueAuditLog {
    public private(set) var rows: [OverdueAuditRow] = []
    public init() {}
    public func record(_ list: OverdueList) {
        rows.append(OverdueAuditRow(count: list.total, reportIDs: list.reportIDs))
    }
}

extension PrototypeStore {
    /// How many reports are waiting past their due date, across every period (the Home number).
    /// Zero for anyone but the director.
    public func overdueCount(today: LocalDate) -> Int {
        waitingReports(today: today).count
    }

    /// The director's list: unfiled reports past their due date, grouped by building and then case
    /// manager, oldest due date first and then student. Empty for anyone but the director.
    public func overdueList(today: LocalDate, period: String? = nil) -> OverdueList {
        let all = waitingReports(today: today)
        var periods: [String] = []
        for item in all.sorted(by: { $0.report.dueDate > $1.report.dueDate })
        where !periods.contains(item.row.periodLabel) {
            periods.append(item.row.periodLabel)
        }
        let rows = period.map { label in all.filter { $0.row.periodLabel == label } } ?? all
        var buildings: [String: [String: [OverdueReport]]] = [:]
        for item in rows {
            buildings[item.building, default: [:]][item.caseManager, default: []].append(item.row)
        }
        let byDue: (OverdueReport, OverdueReport) -> Bool = {
            ($0.dueDate, $0.student) < ($1.dueDate, $1.student)
        }
        return OverdueList(
            total: rows.count,
            buildings: buildings.keys.sorted().map { building in
                OverdueBuildingGroup(
                    building: building,
                    managers: (buildings[building] ?? [:]).keys.sorted().map { manager in
                        OverdueCaseManagerGroup(
                            caseManager: manager,
                            reports: (buildings[building]?[manager] ?? []).sorted(by: byDue))
                    })
            },
            periods: periods)
    }

    private struct Waiting {
        let report: ProgressReport
        let row: OverdueReport
        let building: String
        let caseManager: String
    }

    private func waitingReports(today: LocalDate) -> [Waiting] {
        guard roleView.showsOverdueReports, let calendar = dataset.schoolCalendar else { return [] }
        let students = Dictionary(uniqueKeysWithValues: allStudents.map { ($0.id, $0) })
        let ieps = Dictionary(uniqueKeysWithValues: dataset.ieps.map { ($0.id, $0) })
        let periods = Dictionary(uniqueKeysWithValues: dataset.reportingPeriods.map { ($0.id, $0) })
        return dataset.progressReports.compactMap { report in
            let status = ProgressReportRules.status(
                state: report.state, dueDate: report.dueDate, today: today, calendar: calendar)
            guard status.overdue,
                let words = ProgressReportRules.waitingLabel(report.state),
                let student = ieps[report.iepID].flatMap({ students[$0.studentID] }),
                let period = periods[report.reportingPeriodID]
            else { return nil }
            let rank =
                dataset.reportingPeriods
                .filter { $0.schoolID == period.schoolID }
                .sorted { $0.srsReportDate < $1.srsReportDate }
                .firstIndex { $0.id == period.id }.map { $0 + 1 } ?? 1
            let holder = (dataset.caseloadAssignments + addedAssignments).first {
                $0.studentID == student.id && $0.relationship == .caseload
            }
            let initial = student.lastName.first.map { " \($0)." } ?? ""
            let label = "Quarter \(rank)"
            return Waiting(
                report: report,
                row: OverdueReport(
                    id: report.id, studentID: student.id, student: "\(student.firstName)\(initial)",
                    grade: student.grade, periodLabel: label, dueDate: report.dueDate, words: words),
                building: school(for: student)?.name
                    .replacingOccurrences(of: " (synthetic)", with: "") ?? "",
                caseManager: holder.map { staffName($0.staffID) } ?? "the case manager")
        }
    }
}
