// swift-tools-version:6.0
// Outbox push and change-feed pull (architecture 6.3). Owned by Track 2.
import PackageDescription

let package = Package(
    name: "SyncEngine",
    platforms: [.macOS(.v15), .iOS(.v18)],
    products: [
        .library(name: "SyncEngine", targets: ["SyncEngine"])
    ],
    dependencies: [.package(path: "../CoreModels"), .package(path: "../Persistence"), .package(path: "../APIClient")],
    targets: [
        .target(name: "SyncEngine", dependencies: [.product(name: "CoreModels", package: "CoreModels"), .product(name: "Persistence", package: "Persistence"), .product(name: "APIClient", package: "APIClient")]),
        .testTarget(name: "SyncEngineTests", dependencies: ["SyncEngine", .product(name: "CoreModels", package: "CoreModels"), .product(name: "Persistence", package: "Persistence"), .product(name: "APIClient", package: "APIClient")]),
    ]
)
