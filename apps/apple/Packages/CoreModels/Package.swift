// swift-tools-version:6.0
// (CONTRIBUTING.md rule 3). Foundation only: no Apple UI
// frameworks, so it also builds and tests on Linux.
import PackageDescription

let package = Package(
    name: "CoreModels",
    platforms: [.macOS(.v15), .iOS(.v18)],
    products: [
        .library(name: "CoreModels", targets: ["CoreModels"])
    ],
    targets: [
        .target(name: "CoreModels"),
        .testTarget(name: "CoreModelsTests", dependencies: ["CoreModels"]),
    ]
)
