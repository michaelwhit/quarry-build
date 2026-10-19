import Foundation
import Testing

@testable import CoreModels

/// The repository root, found from this file's path (Tests/CoreModelsTests/ in the package).
let repoRoot: URL = {
    var url = URL(fileURLWithPath: #filePath)
    for _ in 0..<7 { url.deleteLastPathComponent() }
    return url
}()

let fixtureURL = repoRoot.appendingPathComponent(
    "packages/synthetic-data/fixtures/demo-district.json")

@Suite("Synthetic fixture contract")
struct FixtureContractTests {
    let dataset: SyntheticDataset

    init() throws {
        dataset = try SyntheticDataset.load(from: Data(contentsOf: fixtureURL))
    }

    @Test("decodes every record the TypeScript generator writes")
    func decodesEverything() {
        #expect(dataset.synthetic)
        #expect(dataset.students.count == 12)
        #expect(!dataset.goals.isEmpty)
        #expect(dataset.measurementPlans.count == dataset.goals.count)
        #expect(!dataset.dataPoints.isEmpty)
        #expect(dataset.staff.contains { $0.role == .spedDirector })
    }

    @Test("every fixture data point is valid for its plan")
    func dataPointsValidate() throws {
        let plans = Dictionary(uniqueKeysWithValues: dataset.measurementPlans.map { ($0.id, $0) })
        for point in dataset.dataPoints {
            let plan = try #require(plans[point.planID])
            try point.validate(against: plan)
        }
    }

    @Test("fixture ids are UUIDv7")
    func idsAreVersion7() {
        for student in dataset.students {
            #expect(UUIDv7.date(of: student.id) != nil)
        }
    }

    @Test("refuses a dataset that is not marked synthetic")
    func refusesUnmarkedData() throws {
        var json = try String(contentsOf: fixtureURL, encoding: .utf8)
        json = json.replacingOccurrences(of: "\"synthetic\": true", with: "\"synthetic\": false")
        #expect(throws: SyntheticDataset.LoadError.notSynthetic) {
            try SyntheticDataset.load(from: Data(json.utf8))
        }
    }

    @Test("round-trips through the coreModels encoder")
    func roundTrips() throws {
        let data = try JSONEncoder.coreModels.encode(dataset)
        let again = try JSONDecoder.coreModels.decode(SyntheticDataset.self, from: data)
        #expect(again.students == dataset.students)
        #expect(again.dataPoints == dataset.dataPoints)
    }
}
