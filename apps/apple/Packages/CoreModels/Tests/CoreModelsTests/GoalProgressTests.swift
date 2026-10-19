import Foundation
import Testing

@testable import CoreModels

@Suite("GoalProgress")
struct GoalProgressTests {
    let tenant = UUIDv7.make()
    let goal = UUIDv7.make()
    let staff = UUIDv7.make()
    let device = UUIDv7.make()
    let start = Date(timeIntervalSince1970: 1_790_000_000)

    func percentPlan(target: Double = 80) -> MeasurementPlan {
        MeasurementPlan(
            id: UUIDv7.make(), tenantID: tenant, goalID: goal, type: .percentCorrect, unit: "percent",
            targetValue: target)
    }

    func points(_ values: [Double], plan: MeasurementPlan, everyDays days: Double = 3.5)
        -> [DataPoint]
    {
        values.enumerated().map { index, value in
            DataPoint(
                tenantID: tenant, goalID: goal, planID: plan.id,
                observedAt: start.addingTimeInterval(Double(index) * days * 86_400),
                valueNum: value, collectorID: staff, deviceID: device)
        }
    }

    @Test("needs three observations before it reports statistics")
    func tooFew() {
        let plan = percentPlan()
        let progress = GoalProgress(plan: plan, dataPoints: points([40, 50], plan: plan))
        #expect(progress.recentAverage == nil)
        #expect(progress.trendPerWeek == nil)
        #expect(progress.suggestedSufficient == nil)
        #expect(progress.samples.count == 2)
    }

    @Test("averages the latest three and reads the trend per week")
    func statistics() throws {
        let plan = percentPlan()
        // Two observations a week: +10 per observation is +20 per week.
        let progress = GoalProgress(
            plan: plan, dataPoints: points([40, 50, 60, 70, 80], plan: plan))
        #expect(progress.recentAverage == 70)
        #expect(abs(try #require(progress.trendPerWeek) - 20) < 0.001)
        #expect(progress.latest?.value == 80)
        #expect(progress.first?.value == 40)
        #expect(progress.suggestedSufficient == true)
        let line = try #require(progress.trendLine)
        #expect(line.count == 2)
        #expect(abs(line[0].value - 40) < 0.001)
        #expect(abs(line[1].value - 80) < 0.001)
    }

    @Test("suggests No when far from the target and not improving")
    func notSufficient() {
        let plan = percentPlan()
        let progress = GoalProgress(plan: plan, dataPoints: points([30, 28, 25, 22], plan: plan))
        #expect(progress.suggestedSufficient == false)
    }

    @Test("leaves out a point that a correction replaced")
    func corrections() {
        let plan = percentPlan()
        var data = points([40, 50, 60], plan: plan)
        let wrong = data[2]
        var fixed = wrong
        fixed.id = UUIDv7.make()
        fixed.valueNum = 65
        fixed.correctsID = wrong.id
        data.append(fixed)
        let progress = GoalProgress(plan: plan, dataPoints: data)
        #expect(progress.samples.map(\.value) == [40, 50, 65])
    }

    @Test("ignores points recorded for another plan")
    func otherPlan() {
        let plan = percentPlan()
        let other = percentPlan()
        let progress = GoalProgress(
            plan: plan, dataPoints: points([10, 20, 30], plan: plan) + points([99], plan: other))
        #expect(progress.samples.count == 3)
    }

    @Test("formats results for each measurement type")
    func formatting() {
        let trials = MeasurementPlan(
            id: UUIDv7.make(), tenantID: tenant, goalID: goal, type: .trials, targetValue: 8,
            trialsPerSession: 10)
        var p = DataPoint(
            tenantID: tenant, goalID: goal, planID: trials.id, observedAt: start, correct: 7,
            total: 10, collectorID: staff, deviceID: device)
        #expect(p.summary(for: trials) == "7 of 10")
        #expect(p.chartValue(for: trials) == 7)

        let percent = percentPlan()
        p.planID = percent.id
        p.valueNum = 72
        #expect(p.summary(for: percent) == "72%")

        let minutes = MeasurementPlan(
            id: UUIDv7.make(), tenantID: tenant, goalID: goal, type: .duration, unit: "minutes")
        #expect(ValueFormat.string(3.5, for: minutes) == "3.5 minutes")
        #expect(ValueFormat.string(4, for: minutes) == "4 minutes")
    }
}
