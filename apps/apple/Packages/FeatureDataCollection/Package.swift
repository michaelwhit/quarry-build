// swift-tools-version:6.0
// Data entry and progress graphs. Owned by Track 3.
import PackageDescription

let package = Package(
    name: "FeatureDataCollection",
    platforms: [.macOS(.v15), .iOS(.v18)],
    products: [
        .library(name: "FeatureDataCollection", targets: ["FeatureDataCollection"])
    ],
    dependencies: [.package(path: "../CoreModels"), .package(path: "../Persistence"), .package(path: "../DesignSystem")],
    targets: [
        .target(
            name: "FeatureDataCollection",
            dependencies: [.product(name: "CoreModels", package: "CoreModels"), .product(name: "Persistence", package: "Persistence"), .product(name: "DesignSystem", package: "DesignSystem")]),
        .testTarget(name: "FeatureDataCollectionTests", dependencies: ["FeatureDataCollection"]),
    ]
)
