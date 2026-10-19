import Foundation
import Testing

@testable import CoreModels

@Suite("UUIDv7")
struct UUIDv7Tests {
    @Test("sets the version and variant bits and embeds the timestamp")
    func layout() throws {
        let date = Date(timeIntervalSince1970: 1_792_000_000.123)
        let id = UUIDv7.make(at: date)
        let text = id.uuidString.lowercased()
        #expect(Array(text)[14] == "7")
        #expect("89ab".contains(Array(text)[19]))
        let embedded = try #require(UUIDv7.date(of: id))
        #expect(abs(embedded.timeIntervalSince(date)) < 0.001)
    }

    @Test("sorts by creation time")
    func ordering() {
        let early = UUIDv7.make(at: Date(timeIntervalSince1970: 1_000))
        let late = UUIDv7.make(at: Date(timeIntervalSince1970: 2_000))
        #expect(early.uuidString < late.uuidString)
    }

    @Test("returns nil for other versions")
    func otherVersions() throws {
        let v4 = try #require(UUID(uuidString: "3F2504E0-4F89-41D3-9A0C-0305E82C3301"))
        #expect(UUIDv7.date(of: v4) == nil)
    }
}

@Suite("LocalDate")
struct LocalDateTests {
    @Test("parses and prints YYYY-MM-DD")
    func roundTrip() throws {
        let date = try #require(LocalDate("2026-10-16"))
        #expect(date.year == 2026 && date.month == 10 && date.day == 16)
        #expect(date.description == "2026-10-16")
    }

    @Test("rejects impossible dates", arguments: ["2026-02-30", "2026-13-01", "26-01-01", "x"])
    func rejects(text: String) {
        #expect(LocalDate(text) == nil)
    }

    @Test("orders chronologically")
    func ordering() throws {
        #expect(try #require(LocalDate("2026-09-30")) < #require(LocalDate("2026-10-01")))
    }
}

@Suite("Data point validation")
struct DataPointValidationTests {
    let tenant = UUIDv7.make()
    let goal = UUIDv7.make()
    let staff = UUIDv7.make()
    let device = UUIDv7.make()

    func plan(_ type: MeasurementType, target: Double? = nil) -> MeasurementPlan {
        MeasurementPlan(
            id: UUIDv7.make(), tenantID: tenant, goalID: goal, type: type, targetValue: target,
            trialsPerSession: type == .trials ? 10 : nil,
            promptHierarchy: type == .promptLevel ? ["model", "verbal", "independent"] : [],
            taskSteps: type == .taskAnalysis ? ["a", "b", "c"] : [])
    }

    func point(for plan: MeasurementPlan) -> DataPoint {
        DataPoint(
            tenantID: tenant, goalID: goal, planID: plan.id, observedAt: Date(),
            collectorID: staff, deviceID: device)
    }

    @Test("accepts trials within the total")
    func trials() throws {
        let plan = plan(.trials, target: 8)
        var p = point(for: plan)
        p.correct = 7
        p.total = 10
        try p.validate(against: plan)
        #expect(p.progressFraction(for: plan) == 7.0 / 8.0)
    }

    @Test("rejects more correct than total")
    func correctExceedsTotal() {
        let plan = plan(.trials)
        var p = point(for: plan)
        p.correct = 11
        p.total = 10
        #expect(throws: DataPointValidationError.correctExceedsTotal) {
            try p.validate(against: plan)
        }
    }

    @Test("rejects a percent above 100")
    func percent() {
        let plan = plan(.percentCorrect, target: 80)
        var p = point(for: plan)
        p.valueNum = 120
        #expect(throws: DataPointValidationError.percentOutOfRange) {
            try p.validate(against: plan)
        }
    }

    @Test("needs one result per task step")
    func taskSteps() {
        let plan = plan(.taskAnalysis)
        var p = point(for: plan)
        p.stepResults = [true, false]
        #expect(throws: DataPointValidationError.stepCountMismatch(expected: 3, actual: 2)) {
            try p.validate(against: plan)
        }
    }

    @Test("needs a prompt level from the hierarchy")
    func promptLevel() throws {
        let plan = plan(.promptLevel)
        var p = point(for: plan)
        p.promptLevel = "shouted"
        #expect(throws: DataPointValidationError.unknownPromptLevel("shouted")) {
            try p.validate(against: plan)
        }
        p.promptLevel = "independent"
        try p.validate(against: plan)
        #expect(p.progressFraction(for: plan) == 1)
    }

    @Test("rejects a point recorded against another goal's plan")
    func wrongPlan() {
        let plan = plan(.frequency)
        var p = point(for: plan)
        p.goalID = UUIDv7.make()
        p.valueNum = 3
        #expect(throws: DataPointValidationError.wrongPlan) { try p.validate(against: plan) }
    }

    @Test("caps notes at the database limit")
    func noteLength() {
        let plan = plan(.frequency)
        var p = point(for: plan)
        p.valueNum = 1
        p.note = String(repeating: "x", count: DataPoint.maxNoteLength + 1)
        #expect(throws: DataPointValidationError.noteTooLong) { try p.validate(against: plan) }
    }
}

@Suite("Records")
struct RecordTests {
    @Test("student display name prefers the preferred name, else first name and initial")
    func displayName() {
        var s = Student(
            id: UUIDv7.make(), tenantID: UUIDv7.make(), schoolID: UUIDv7.make(),
            firstName: "Wren", lastName: "Quillfeather", grade: "3")
        #expect(s.displayName == "Wren Q.")
        s.preferredName = "Wr"
        #expect(s.displayName == "Wr")
    }

    @Test("caseload assignments are active only inside their dates")
    func caseloadDates() throws {
        let start = try #require(LocalDate("2026-08-13"))
        let end = try #require(LocalDate("2026-12-18"))
        let a = CaseloadAssignment(
            id: UUIDv7.make(), tenantID: UUIDv7.make(), staffID: UUIDv7.make(),
            studentID: UUIDv7.make(), relationship: .caseload, grantedBy: UUIDv7.make(),
            startDate: start, endDate: end)
        #expect(a.isActive(on: try #require(LocalDate("2026-10-01"))))
        #expect(!a.isActive(on: try #require(LocalDate("2026-08-12"))))
        #expect(!a.isActive(on: try #require(LocalDate("2026-12-19"))))
    }

    @Test("S5 never caches on a device")
    func sensitivity() {
        #expect(!SensitivityTier.s5.mayBeCachedOnDevice)
        #expect(SensitivityTier.allCases.filter(\.mayBeCachedOnDevice).count == 4)
    }
}
