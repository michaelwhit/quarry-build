import Testing

@testable import FeatureIEPEditor

@Suite("FeatureIEPEditor")
struct FeatureIEPEditorTests {
    @Test("package builds and links")
    func builds() {
        #expect(FeatureIEPEditorModule.name == "FeatureIEPEditor")
    }
}
