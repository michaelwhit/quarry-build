import Testing

@testable import AuthKit

@Suite("AuthKit")
struct AuthKitTests {
    @Test("package builds and links")
    func builds() {
        #expect(AuthKitModule.name == "AuthKit")
    }
}
