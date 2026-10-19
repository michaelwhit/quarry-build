// swift-tools-version:6.0
// Client generated from packages/openapi/api.yaml.
import PackageDescription

let package = Package(
    name: "APIClient",
    platforms: [.macOS(.v15), .iOS(.v18)],
    products: [
        .library(name: "APIClient", targets: ["APIClient"])
    ],
    dependencies: [.package(path: "../CoreModels")],
    targets: [
        .target(name: "APIClient", dependencies: [.product(name: "CoreModels", package: "CoreModels")]),
        .testTarget(name: "APIClientTests", dependencies: ["APIClient", .product(name: "CoreModels", package: "CoreModels")]),
    ]
)
