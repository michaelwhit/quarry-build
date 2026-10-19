// swift-tools-version:6.0
// Local store, repositories and (later) the GRDB + SQLCipher database. Owned by Track 2.
import PackageDescription

let package = Package(
    name: "Persistence",
    platforms: [.macOS(.v15), .iOS(.v18)],
    products: [
        .library(name: "Persistence", targets: ["Persistence"])
    ],
    dependencies: [.package(path: "../CoreModels")],
    targets: [
        .target(
            name: "Persistence",
            dependencies: [.product(name: "CoreModels", package: "CoreModels")]),
        .testTarget(
            name: "PersistenceTests",
            dependencies: ["Persistence", .product(name: "CoreModels", package: "CoreModels")]),
    ]
)
