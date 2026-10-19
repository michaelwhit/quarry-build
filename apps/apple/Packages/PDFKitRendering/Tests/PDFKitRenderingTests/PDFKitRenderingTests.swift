import Testing

@testable import PDFKitRendering

@Suite("PDFKitRendering")
struct PDFKitRenderingTests {
    @Test("package builds and links")
    func builds() {
        #expect(PDFKitRenderingModule.name == "PDFKitRendering")
    }
}
