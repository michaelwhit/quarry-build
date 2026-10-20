import DesignSystem
import Persistence
import SwiftUI

/// Shared entry point for the Mac and iPhone apps.
@main
@MainActor
struct IEPAssistantApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            Group {
                if let store = model.store, let acknowledgments = model.acknowledgments {
                    RootView(acknowledgments: acknowledgments).environment(store)
                } else {
                    LoadFailureView(message: model.loadError ?? "Unknown error")
                }
            }
            .testDataWatermark()
        }
    }
}
