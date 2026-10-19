import Testing

@testable import FeatureProgressReports

@Suite("FeatureProgressReports")
struct FeatureProgressReportsTests {
    @Test("package builds and links")
    func builds() {
        #expect(FeatureProgressReportsModule.name == "FeatureProgressReports")
    }
}
