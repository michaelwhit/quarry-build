// swift-tools-version:6.0
// Type, color, spacing, accessible components, TEST DATA watermark.
import PackageDescription

let package = Package(
    name: "DesignSystem",
    platforms: [.macOS(.v15), .iOS(.v18)],
    products: [
        .library(name: "DesignSystem", targets: ["DesignSystem"])
    ],
    dependencies: [],
    targets: [
        .target(name: "DesignSystem", dependencies: []),
        .testTarget(name: "DesignSystemTests", dependencies: ["DesignSystem"]),
    ]
)
