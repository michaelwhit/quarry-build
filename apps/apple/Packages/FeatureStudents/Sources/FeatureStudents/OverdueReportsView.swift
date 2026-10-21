import CoreModels
import DesignSystem
import Persistence
import SwiftUI

/// The director's "Progress reports to file" list: which reports are not filed yet and who to
/// ask. Read only. There is no export, print, share, copy or AI control, no message button and no
/// score: it says what is waiting and names the case manager to ask.
public struct OverdueReportsView: View {
    private let load: (LocalDate, String?) -> OverdueList
    private let recordLoad: (OverdueList) -> Void
    private let openStudent: (UUID) -> Void

    @State private var date: Date
    @State private var picked: String?

    /// `load` returns the list for a day and an optional period; `recordLoad` is told about each
    /// list that is shown (one audit row per load); `openStudent` opens the normal student screen.
    public init(
        today: LocalDate = PrototypeStore.systemToday(),
        load: @escaping (LocalDate, String?) -> OverdueList,
        recordLoad: @escaping (OverdueList) -> Void,
        openStudent: @escaping (UUID) -> Void
    ) {
        self.load = load
        self.recordLoad = recordLoad
        self.openStudent = openStudent
        _date = State(initialValue: Self.date(from: today))
    }

    private var today: LocalDate { Self.localDate(from: date) }

    public var body: some View {
        let everything = load(today, nil)
        let period = everything.periods.contains(picked ?? "") ? picked : everything.periods.first
        let list = load(today, period)
        List {
            Section {
                if list.total == 0 {
                    Text("Nothing is waiting. Every progress report due so far is filed.")
                        .foregroundStyle(Theme.muted)
                } else {
                    Text(topLine(list, period: period)).font(.headline)
                }
                if everything.periods.count > 1 {
                    Picker("Period", selection: Binding(get: { period ?? "" }, set: { picked = $0 })) {
                        ForEach(everything.periods, id: \.self) { Text($0).tag($0) }
                    }
                }
                DatePicker("Practice date", selection: $date, displayedComponents: .date)
                Text("Made-up reports for practice. These are not real students.")
                    .font(.footnote).foregroundStyle(Theme.muted)
            }
            ForEach(list.buildings) { building in
                Section(building.building) {
                    ForEach(building.managers) { manager in
                        DisclosureGroup {
                            ForEach(manager.reports) { report in
                                row(report)
                            }
                            Text("Ask the case manager: \(manager.caseManager).")
                                .font(.footnote).foregroundStyle(Theme.muted)
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(manager.caseManager).font(.headline)
                                Text("\(manager.reports.count) report\(manager.reports.count == 1 ? "" : "s")")
                                    .font(.footnote).foregroundStyle(Theme.muted)
                            }
                            .frame(minHeight: Spacing.minTapTarget, alignment: .leading)
                        }
                    }
                }
            }
        }
        .accessibilityIdentifier("overdue-reports")
        .themedList()
        .navigationTitle("Progress reports to file")
        .task(id: list) { recordLoad(list) }
    }

    private func row(_ report: OverdueReport) -> some View {
        Button {
            openStudent(report.studentID)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(report.student).font(.headline).foregroundStyle(Theme.ink)
                Text("Grade \(report.grade) · \(report.periodLabel) · due \(Self.short(report.dueDate)) · \(report.words)")
                    .font(.footnote).foregroundStyle(Theme.muted)
            }
            .frame(maxWidth: .infinity, minHeight: Spacing.minTapTarget, alignment: .leading)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }

    private func topLine(_ list: OverdueList, period: String?) -> String {
        var line = "\(list.total) waiting past their due date"
        if let period, let due = list.buildings.first?.managers.first?.reports.first?.dueDate {
            line += " · \(period) report, due \(Self.short(due))"
        }
        return line
    }

    private static let months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]

    private static func short(_ date: LocalDate) -> String {
        "\(months[date.month - 1]) \(date.day)"
    }

    private static func date(from day: LocalDate) -> Date {
        Calendar.current.date(from: DateComponents(year: day.year, month: day.month, day: day.day))
            ?? Date()
    }

    private static func localDate(from date: Date) -> LocalDate {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return LocalDate(year: parts.year ?? 2026, month: parts.month ?? 1, day: parts.day ?? 1)
            ?? LocalDate(year: 2026, month: 1, day: 1)!
    }
}

/// The director's Home line: how many reports are waiting, shown calmly at zero.
public struct OverdueHomeLine: View {
    private let count: Int
    private let open: () -> Void

    public init(count: Int, open: @escaping () -> Void) {
        self.count = count
        self.open = open
    }

    public var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 4) {
                Text(count == 0 ? "No progress reports overdue" : "\(count) progress report\(count == 1 ? "" : "s") overdue")
                    .font(.headline).foregroundStyle(Theme.ink)
                Text(count == 0 ? "Everything due so far is filed." : "Tap to see who to ask.")
                    .font(.footnote).foregroundStyle(Theme.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .card()
            .accessibilityElement(children: .combine)
        }
        .buttonStyle(.plain)
        .accessibilityHint("Opens the progress reports to file")
        .accessibilityIdentifier("overdue-home-line")
    }
}
