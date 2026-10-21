import Foundation

/// Where one SRS progress report stands. A report is filed once the teacher has attested it in SRS
/// or the SRS PDF has been checked against it.
public enum ProgressReportState: String, Codable, Sendable, CaseIterable {
    case notStarted = "not_started"
    case drafted
    case approved
    case copied
    case filedAttested = "filed_attested"
    case verifiedByPDF = "verified_by_pdf"
}

public enum ProgressReportMethod: String, Codable, Sendable {
    case pasteKit = "paste_kit"
    case pdfAppendix = "pdf_appendix"
}

/// One SRS progress report for one IEP and one reporting period.
public struct ProgressReport: Identifiable, Hashable, Codable, Sendable {
    public var id: UUID
    public var tenantID: UUID
    public var iepID: UUID
    public var reportingPeriodID: UUID
    public var dueDate: LocalDate
    public var state: ProgressReportState
    public var srsMethod: ProgressReportMethod?
    public var filedAttestedBy: UUID?
    public var filedAttestedAt: Date?

    public init(
        id: UUID, tenantID: UUID, iepID: UUID, reportingPeriodID: UUID, dueDate: LocalDate,
        state: ProgressReportState, srsMethod: ProgressReportMethod? = nil,
        filedAttestedBy: UUID? = nil, filedAttestedAt: Date? = nil
    ) {
        self.id = id
        self.tenantID = tenantID
        self.iepID = iepID
        self.reportingPeriodID = reportingPeriodID
        self.dueDate = dueDate
        self.state = state
        self.srsMethod = srsMethod
        self.filedAttestedBy = filedAttestedBy
        self.filedAttestedAt = filedAttestedAt
    }

    enum CodingKeys: String, CodingKey {
        case id, state
        case tenantID = "tenant_id"
        case iepID = "iep_id"
        case reportingPeriodID = "reporting_period_id"
        case dueDate = "due_date"
        case srsMethod = "srs_method"
        case filedAttestedBy = "filed_attested_by"
        case filedAttestedAt = "filed_attested_at"
    }
}

/// Days with no school (breaks, holidays, staff days) in one school year. Weekends are implied.
public struct SchoolCalendar: Hashable, Codable, Sendable {
    public var schoolYear: String
    public var noSchoolDays: [LocalDate]

    public init(schoolYear: String, noSchoolDays: [LocalDate]) {
        self.schoolYear = schoolYear
        self.noSchoolDays = noSchoolDays
    }

    enum CodingKeys: String, CodingKey {
        case schoolYear = "school_year"
        case noSchoolDays = "no_school_days"
    }
}

/// What the overdue rule says about one report on one day.
public struct ProgressReportStatus: Equatable, Sendable {
    public var filed: Bool
    /// The first school day after the due date. A report is not overdue before this day.
    public var firstOverdueDay: LocalDate
    public var overdue: Bool
    /// School days from the first overdue day through today, both counted; 0 when not overdue.
    public var daysOverdue: Int
}

/// The one reading of "overdue" for progress reports. The web app's copy is
/// packages/synthetic-data/src/progress-reports.ts; both are checked against
/// packages/synthetic-data/vectors/progress-reports.json, so a change here is a change to that
/// file and to the other copy.
public enum ProgressReportRules {
    public static func isFiled(_ state: ProgressReportState) -> Bool {
        state == .filedAttested || state == .verifiedByPDF
    }

    /// Where a waiting report stands, in the words the screens use. Nil once it is filed.
    public static func waitingLabel(_ state: ProgressReportState) -> String? {
        switch state {
        case .notStarted: "Not started"
        case .drafted: "Draft saved"
        case .approved: "Approved, ready to copy"
        case .copied: "Copied, not yet marked filed"
        case .filedAttested, .verifiedByPDF: nil
        }
    }

    public static func isSchoolDay(_ day: LocalDate, calendar: SchoolCalendar) -> Bool {
        !day.isWeekend && !calendar.noSchoolDays.contains(day)
    }

    /// The first school day strictly after `day`.
    public static func nextSchoolDay(after day: LocalDate, calendar: SchoolCalendar) -> LocalDate {
        var n = day.dayNumber + 1
        while !isSchoolDay(LocalDate(dayNumber: n), calendar: calendar) { n += 1 }
        return LocalDate(dayNumber: n)
    }

    /// A report is overdue when it is not filed and `today` is on or after the first school day
    /// after its due date. Weekends, breaks and staff days are never late days. Overdue describes
    /// the report, never a person.
    public static func status(
        state: ProgressReportState, dueDate: LocalDate, today: LocalDate, calendar: SchoolCalendar
    ) -> ProgressReportStatus {
        let first = nextSchoolDay(after: dueDate, calendar: calendar)
        let filed = isFiled(state)
        var days = 0
        if !filed, first <= today {
            for n in first.dayNumber...today.dayNumber
            where isSchoolDay(LocalDate(dayNumber: n), calendar: calendar) {
                days += 1
            }
        }
        return ProgressReportStatus(
            filed: filed, firstOverdueDay: first, overdue: days > 0, daysOverdue: days)
    }
}

extension LocalDate {
    private static let utc: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }()

    /// Whole days since 1970-01-01.
    public var dayNumber: Int {
        let date = Self.utc.date(from: DateComponents(year: year, month: month, day: day))!
        return Int((date.timeIntervalSince1970 / 86_400).rounded(.down))
    }

    /// The date `dayNumber` days after 1970-01-01.
    public init(dayNumber: Int) {
        let date = Date(timeIntervalSince1970: Double(dayNumber) * 86_400)
        let parts = Self.utc.dateComponents([.year, .month, .day], from: date)
        self = LocalDate(year: parts.year!, month: parts.month!, day: parts.day!)!
    }

    public var isWeekend: Bool {
        let weekday = Self.utc.component(
            .weekday, from: Self.utc.date(from: DateComponents(year: year, month: month, day: day))!)
        return weekday == 1 || weekday == 7
    }
}
