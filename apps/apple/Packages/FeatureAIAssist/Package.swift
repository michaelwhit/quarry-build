// swift-tools-version:6.0
// AI drafting screens and the mock drafter.
import PackageDescription

let package = Package(
    name: "FeatureAIAssist",
    platforms: [.macOS(.v15), .iOS(.v18)],
    products: [
        .library(name: "FeatureAIAssist", targets: ["FeatureAIAssist"])
    ],
    dependencies: [.package(path: "../CoreModels"), .package(path: "../Persistence"), .package(path: "../DesignSystem")],
    targets: [
        .target(
            name: "FeatureAIAssist",
            dependencies: [.product(name: "CoreModels", package: "CoreModels"), .product(name: "Persistence", package: "Persistence"), .product(name: "DesignSystem", package: "DesignSystem")]),
        .testTarget(
            name: "FeatureAIAssistTests",
            dependencies: ["FeatureAIAssist", .product(name: "CoreModels", package: "CoreModels"), .product(name: "Persistence", package: "Persistence"), .product(name: "DesignSystem", package: "DesignSystem")]),
    ]
)
