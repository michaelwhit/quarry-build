// swift-tools-version:6.0
// On-device data sheets and charts. Owned by Track 3.
import PackageDescription

let package = Package(
    name: "PDFKitRendering",
    platforms: [.macOS(.v15), .iOS(.v18)],
    products: [
        .library(name: "PDFKitRendering", targets: ["PDFKitRendering"])
    ],
    dependencies: [.package(path: "../CoreModels")],
    targets: [
        .target(name: "PDFKitRendering", dependencies: [.product(name: "CoreModels", package: "CoreModels")]),
        .testTarget(name: "PDFKitRenderingTests", dependencies: ["PDFKitRendering", .product(name: "CoreModels", package: "CoreModels")]),
    ]
)
