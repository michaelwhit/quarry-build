import CoreModels
import DesignSystem
import Persistence
import SwiftUI

/// The director's "What's due" screen: for each case manager, the reports and IEP dates that are
/// overdue or coming up, and the students who need data recorded. Read only. There is no export,
/// print, share, copy or AI control, no message button and no score or ranking: it says what is
/// due and names the case manager to ask. "Overdue" and "needs data" describe records, never a
/// person.
public struct WhatsDueView: View {
    private let load: (LocalDate, Int) -> WhatsDue
    private let recordLoad: (WhatsDue) -> Void
    private let loadOverdue: (LocalDate, String?) -> OverdueList
    private let recordOverdueLoad: (OverdueList) -> Void
    private let openStudent: (UUID) -> Void

    @State private var date: Date
    @State private var windowDays = WhatsDue.windows[0]

    /// `load` returns the screen for a day and a look-ahead window; `recordLoad` is told about each
    /// one that is shown (one audit row per load). `loadOverdue` and `recordOverdueLoad` feed the
    /// "Progress reports to file" list this screen links to; `openStudent` opens the normal
    /// student screen.
    public init(
        today: LocalDate = PrototypeStore.systemToday(),
        load: @escaping (LocalDate, Int) -> WhatsDue,
        recordLoad: @escaping (WhatsDue) -> Void,
        loadOverdue: @escaping (LocalDate, String?) -> OverdueList,
        recordOverdueLoad: @escaping (OverdueList) -> Void,
        openStudent: @escaping (UUID) -> Void
    ) {
        self.load = load
        self.recordLoad = recordLoad
        self.loadOverdue = loadOverdue
        self.recordOverdueLoad = recordOverdueLoad
        self.openStudent = openStudent
        _date = State(initialValue: Self.date(from: today))
    }

    private var today: LocalDate { Self.localDate(from: date) }

    public var body: some View {
        let view = load(today, windowDays)
        List {
            Section {
                Text(
                    "\(view.overdueCount) overdue · \(view.comingUpCount) coming up · \(view.needsDataCount) with data to record"
                )
                .font(.headline)
                Text(
                    "Reports and IEP dates, with students who have gone more than five school days without a data point on a goal."
                )
                .font(.footnote).foregroundStyle(Theme.muted)
                Picker("Coming up within", selection: $windowDays) {
                    ForEach(WhatsDue.windows.reversed(), id: \.self) { Text("\($0) days").tag($0) }
                }
                DatePicker("Practice date", selection: $date, displayedComponents: .date)
                Text("Made-up reports, dates and data for practice. These are not real students.")
                    .font(.footnote).foregroundStyle(Theme.muted)
            }
            if view.total == 0 {
                Section {
                    Text("Nothing is due or waiting for data. Everything is up to date.")
                        .foregroundStyle(Theme.muted)
                }
            }
            ForEach(view.managers) { manager in
                Section {
                    Text(
                        "\(manager.buildings.joined(separator: " and ")) · \(manager.overdue.count) overdue · \(manager.comingUp.count) coming up · \(manager.needsData.count) with data to record"
                    )
                    .font(.footnote).foregroundStyle(Theme.muted)
                    if !manager.overdue.isEmpty {
                        group("Overdue", count: manager.overdue.count)
                        ForEach(manager.overdue) { itemRow($0) }
                    }
                    if !manager.comingUp.isEmpty {
                        group("Coming up", count: manager.comingUp.count)
                        ForEach(manager.comingUp) { itemRow($0) }
                    }
                    if !manager.needsData.isEmpty {
                        group("Data to record", count: manager.needsData.count)
                        ForEach(manager.needsData) { gapRow($0) }
                    }
                } header: {
                    Text(manager.caseManager).font(.headline).foregroundStyle(Theme.ink)
                        .textCase(nil)
                }
            }
            Section {
                NavigationLink("Progress reports to file, by building") {
                    OverdueReportsView(
                        today: today, load: loadOverdue, recordLoad: recordOverdueLoad,
                        openStudent: openStudent)
                }
                .frame(minHeight: Spacing.minTapTarget)
            }
        }
        .accessibilityIdentifier("whats-due")
        .themedList()
        .navigationTitle("What's due")
        .task(id: view) { recordLoad(view) }
    }

    private func group(_ title: String, count: Int) -> some View {
        Text("\(title) · \(count)").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
            .padding(.top, Spacing.small)
    }

    private func itemRow(_ item: DueItem) -> some View {
        Button {
            openStudent(item.studentID)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.student).font(.headline).foregroundStyle(Theme.ink)
                Text("\(item.what) · due \(Self.short(item.dueDate))")
                    .font(.footnote).foregroundStyle(Theme.muted)
            }
            .frame(maxWidth: .infinity, minHeight: Spacing.minTapTarget, alignment: .leading)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }

    private func gapRow(_ gap: DataGap) -> some View {
        Button {
            openStudent(gap.studentID)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(gap.student).font(.headline).foregroundStyle(Theme.ink)
                Text(gapWords(gap)).font(.footnote).foregroundStyle(Theme.muted)
            }
            .frame(maxWidth: .infinity, minHeight: Spacing.minTapTarget, alignment: .leading)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }

    private func gapWords(_ gap: DataGap) -> String {
        let goals = gap.goalsTotal == 1 ? "goal" : "goals"
        let last = gap.lastRecorded.map { "last recorded \(Self.short($0))" } ?? "none recorded yet"
        return "\(gap.goalsWithoutData) of \(gap.goalsTotal) \(goals) need data · \(last)"
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
