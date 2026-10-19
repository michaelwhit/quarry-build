// swift-tools-version:6.0
// Evaluation intake: typed or pasted scores and summaries, a redaction preview, and a teacher
// confirmation. Logic is Foundation-only and unit tested. Nothing here is saved or sent anywhere.
import PackageDescription

let package = Package(
    name: "FeatureEvaluation",
    platforms: [.macOS(.v15), .iOS(.v18)],
    products: [
        .library(name: "FeatureEvaluation", targets: ["FeatureEvaluation"])
    ],
    dependencies: [.package(path: "../DesignSystem")],
    targets: [
        .target(
            name: "FeatureEvaluation",
            dependencies: [.product(name: "DesignSystem", package: "DesignSystem")]),
        .testTarget(name: "FeatureEvaluationTests", dependencies: ["FeatureEvaluation"]),
    ]
)
