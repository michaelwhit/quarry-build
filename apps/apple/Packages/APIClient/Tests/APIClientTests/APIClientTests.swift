import Testing

@testable import APIClient

@Suite("APIClient")
struct APIClientTests {
    @Test("package builds and links")
    func builds() {
        #expect(APIClientModule.name == "APIClient")
    }
}
