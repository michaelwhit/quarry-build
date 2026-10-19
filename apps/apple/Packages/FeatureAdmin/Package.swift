// swift-tools-version:6.0
// Director and admin screens (caseload upload). Owned by Track 3.
import PackageDescription

let package = Package(
    name: "FeatureAdmin",
    platforms: [.macOS(.v15), .iOS(.v18)],
    products: [
        .library(name: "FeatureAdmin", targets: ["FeatureAdmin"])
    ],
    dependencies: [.package(path: "../CoreModels"), .package(path: "../DesignSystem")],
    targets: [
        .target(name: "FeatureAdmin", dependencies: [.product(name: "CoreModels", package: "CoreModels"), .product(name: "DesignSystem", package: "DesignSystem")]),
        .testTarget(name: "FeatureAdminTests", dependencies: ["FeatureAdmin", .product(name: "CoreModels", package: "CoreModels"), .product(name: "DesignSystem", package: "DesignSystem")]),
    ]
)
