import CoreModels
import Foundation
import Testing

@testable import FeatureAdmin

@Suite("Day conversion")
struct DayConversionTests {
    @Test("a day survives the trip to a date picker and back in any time zone")
    func roundTrip() throws {
        let day = try #require(LocalDate(year: 2027, month: 6, day: 30))
        for name in ["America/Chicago", "America/Los_Angeles", "UTC", "Pacific/Auckland"] {
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = try #require(TimeZone(identifier: name))
            let date = DayConversion.date(day, calendar: calendar)
            #expect(DayConversion.day(date, calendar: calendar) == day)
        }
    }
}
