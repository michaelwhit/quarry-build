import SwiftUI

#if canImport(UIKit)
    import UIKit
#elseif canImport(AppKit)
    import AppKit
#endif

/// The tick on every recorded tap, so a teacher need not look at the screen (spec 10.2).
public enum Haptics {
    @MainActor
    public static func tick() {
        #if canImport(UIKit)
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        #elseif canImport(AppKit)
            NSHapticFeedbackManager.defaultPerformer.perform(.generic, performanceTime: .default)
        #endif
    }
}
