// swift-tools-version:6.0
// Library screens: browse the goal and accommodation libraries, preview an item (T3-18), then the
// fill-in form (T3-19). Second screens worker (Fiddler); paths are Track 3's under .github/ownership.yml.
// Search and filtering are Foundation-only and unit tested; views sit on top.
import PackageDescription

let package = Package(
    name: "FeatureLibrary",
    platforms: [.macOS(.v15), .iOS(.v18)],
    products: [
        .library(name: "FeatureLibrary", targets: ["FeatureLibrary"])
    ],
    dependencies: [.package(path: "../StarterLibrary"), .package(path: "../DesignSystem")],
    targets: [
        .target(
            name: "FeatureLibrary",
            dependencies: [
                .product(name: "StarterLibrary", package: "StarterLibrary"),
                .product(name: "DesignSystem", package: "DesignSystem"),
            ]),
        .testTarget(
            name: "FeatureLibraryTests",
            dependencies: ["FeatureLibrary", .product(name: "StarterLibrary", package: "StarterLibrary")]),
    ]
)
