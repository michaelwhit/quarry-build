// swift-tools-version:6.0
// Progress reports and SRS paste kit screens (sprint three). Owned by Track 5.
import PackageDescription

let package = Package(
    name: "FeatureProgressReports",
    platforms: [.macOS(.v15), .iOS(.v18)],
    products: [
        .library(name: "FeatureProgressReports", targets: ["FeatureProgressReports"])
    ],
    dependencies: [.package(path: "../CoreModels"), .package(path: "../DesignSystem")],
    targets: [
        .target(name: "FeatureProgressReports", dependencies: [.product(name: "CoreModels", package: "CoreModels"), .product(name: "DesignSystem", package: "DesignSystem")]),
        .testTarget(name: "FeatureProgressReportsTests", dependencies: ["FeatureProgressReports", .product(name: "CoreModels", package: "CoreModels"), .product(name: "DesignSystem", package: "DesignSystem")]),
    ]
)
