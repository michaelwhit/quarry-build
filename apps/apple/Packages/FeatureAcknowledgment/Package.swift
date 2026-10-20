// swift-tools-version:6.0
// The one-page confidentiality acknowledgment shown on first sign-in to roles that must agree before seeing students.
// The screen reports the choice through callbacks; recording it is done by the sign-in code.
import PackageDescription

let package = Package(
    name: "FeatureAcknowledgment",
    platforms: [.macOS(.v15), .iOS(.v18)],
    products: [
        .library(name: "FeatureAcknowledgment", targets: ["FeatureAcknowledgment"])
    ],
    dependencies: [.package(path: "../DesignSystem")],
    targets: [
        .target(
            name: "FeatureAcknowledgment",
            dependencies: [.product(name: "DesignSystem", package: "DesignSystem")]),
        .testTarget(name: "FeatureAcknowledgmentTests", dependencies: ["FeatureAcknowledgment"]),
    ]
)
