import Testing

@testable import DesignSystem

@Suite("DesignSystem")
struct DesignSystemTests {
    @Test("package builds and links")
    func builds() {
        #expect(DesignSystemModule.name == "DesignSystem")
    }
}
