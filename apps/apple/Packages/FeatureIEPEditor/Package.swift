// swift-tools-version:6.0
// IEP editor (sprint three). Owned by Track 3.
import PackageDescription

let package = Package(
    name: "FeatureIEPEditor",
    platforms: [.macOS(.v15), .iOS(.v18)],
    products: [
        .library(name: "FeatureIEPEditor", targets: ["FeatureIEPEditor"])
    ],
    dependencies: [.package(path: "../CoreModels"), .package(path: "../DesignSystem")],
    targets: [
        .target(name: "FeatureIEPEditor", dependencies: [.product(name: "CoreModels", package: "CoreModels"), .product(name: "DesignSystem", package: "DesignSystem")]),
        .testTarget(name: "FeatureIEPEditorTests", dependencies: ["FeatureIEPEditor", .product(name: "CoreModels", package: "CoreModels"), .product(name: "DesignSystem", package: "DesignSystem")]),
    ]
)
