import CoreModels
import Foundation

/// Converts between the app's plain calendar days and the dates a date picker works with.
/// Both directions use the device calendar, because a date picker shows and returns local days.
enum DayConversion {
    static func date(_ day: LocalDate, calendar: Calendar = .current) -> Date {
        calendar.date(from: DateComponents(year: day.year, month: day.month, day: day.day)) ?? Date()
    }

    static func day(_ date: Date, calendar: Calendar = .current) -> LocalDate? {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        guard let year = parts.year, let month = parts.month, let day = parts.day else { return nil }
        return LocalDate(year: year, month: month, day: day)
    }
}
