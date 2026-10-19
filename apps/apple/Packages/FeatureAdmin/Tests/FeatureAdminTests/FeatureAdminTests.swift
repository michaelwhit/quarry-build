import Testing

@testable import FeatureAdmin

@Suite("FeatureAdmin")
struct FeatureAdminTests {
    @Test("package builds and links")
    func builds() {
        #expect(FeatureAdminModule.name == "FeatureAdmin")
    }
}
