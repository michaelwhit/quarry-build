// swift-tools-version:6.0
// Caseload list and student view.
import PackageDescription

let package = Package(
    name: "FeatureStudents",
    platforms: [.macOS(.v15), .iOS(.v18)],
    products: [
        .library(name: "FeatureStudents", targets: ["FeatureStudents"])
    ],
    dependencies: [.package(path: "../CoreModels"), .package(path: "../Persistence"), .package(path: "../DesignSystem"), .package(path: "../FeatureImport")],
    targets: [
        .target(
            name: "FeatureStudents",
            dependencies: [.product(name: "CoreModels", package: "CoreModels"), .product(name: "Persistence", package: "Persistence"), .product(name: "DesignSystem", package: "DesignSystem"), .product(name: "FeatureImport", package: "FeatureImport")]),
    ]
)
