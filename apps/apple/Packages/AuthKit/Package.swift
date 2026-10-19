// swift-tools-version:6.0
// Sign-in, session, app lock (AuthSession API for Track 3). Owned by Track 1.
import PackageDescription

let package = Package(
    name: "AuthKit",
    platforms: [.macOS(.v15), .iOS(.v18)],
    products: [
        .library(name: "AuthKit", targets: ["AuthKit"])
    ],
    dependencies: [.package(path: "../CoreModels")],
    targets: [
        .target(name: "AuthKit", dependencies: [.product(name: "CoreModels", package: "CoreModels")]),
        .testTarget(name: "AuthKitTests", dependencies: ["AuthKit", .product(name: "CoreModels", package: "CoreModels")]),
    ]
)
