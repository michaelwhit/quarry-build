// swift-tools-version:6.0
// Data-collection sessions and the Today tab. Second screens worker (Track 3b); the paths are
// Track 3's under .github/ownership.yml. Session logic is Foundation-only and unit tested.
import PackageDescription

let package = Package(
    name: "FeatureSession",
    platforms: [.macOS(.v15), .iOS(.v18)],
    products: [
        .library(name: "FeatureSession", targets: ["FeatureSession"])
    ],
    dependencies: [.package(path: "../CoreModels"), .package(path: "../DesignSystem")],
    targets: [
        .target(
            name: "FeatureSession",
            dependencies: [
                .product(name: "CoreModels", package: "CoreModels"),
                .product(name: "DesignSystem", package: "DesignSystem"),
            ]),
        .testTarget(
            name: "FeatureSessionTests",
            dependencies: ["FeatureSession", .product(name: "CoreModels", package: "CoreModels")]),
    ]
)
