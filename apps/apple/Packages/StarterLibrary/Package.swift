// swift-tools-version:6.0
// Reads the signed starter library bundle (T2-10). Foundation only, so it builds on Linux; signature
// checking needs CryptoKit and is compiled on Apple platforms.
import PackageDescription

let package = Package(
    name: "StarterLibrary",
    platforms: [.macOS(.v15), .iOS(.v18)],
    products: [
        .library(name: "StarterLibrary", targets: ["StarterLibrary"])
    ],
    targets: [
        .target(name: "StarterLibrary"),
        .testTarget(name: "StarterLibraryTests", dependencies: ["StarterLibrary"]),
    ]
)
