// swift-tools-version:6.0
// Client-side audit event queue.
import PackageDescription

let package = Package(
    name: "Audit",
    platforms: [.macOS(.v15), .iOS(.v18)],
    products: [
        .library(name: "Audit", targets: ["Audit"])
    ],
    dependencies: [.package(path: "../CoreModels")],
    targets: [
        .target(name: "Audit", dependencies: [.product(name: "CoreModels", package: "CoreModels")]),
        .testTarget(name: "AuditTests", dependencies: ["Audit", .product(name: "CoreModels", package: "CoreModels")]),
    ]
)
