// swift-tools-version:6.0
// Caseload file import: read a spreadsheet export, match its columns, preview, then add students.
// The file reading and checking is Foundation-only and unit tested; the screen sits on top.
import PackageDescription

let package = Package(
    name: "FeatureImport",
    platforms: [.macOS(.v15), .iOS(.v18)],
    products: [
        .library(name: "FeatureImport", targets: ["FeatureImport"])
    ],
    dependencies: [
        .package(path: "../CoreModels"), .package(path: "../Persistence"), .package(path: "../DesignSystem"),
    ],
    targets: [
        .target(
            name: "FeatureImport",
            dependencies: [
                .product(name: "CoreModels", package: "CoreModels"),
                .product(name: "Persistence", package: "Persistence"),
                .product(name: "DesignSystem", package: "DesignSystem"),
            ]),
        .testTarget(
            name: "FeatureImportTests",
            dependencies: ["FeatureImport", .product(name: "CoreModels", package: "CoreModels")]),
    ]
)
