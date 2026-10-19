import CoreModels
import Foundation
import Observation
import Persistence

/// Loads the synthetic district bundled with the app and creates the store. Everything is local:
/// no network, no account. Real sign-in and the encrypted database replace this later.
@MainActor
@Observable
final class AppModel {
    private(set) var store: PrototypeStore?
    private(set) var loadError: String?

    init() {
        do {
            guard let url = Bundle.main.url(forResource: "demo-district", withExtension: "json")
            else {
                loadError = "The demo district file is missing from this build."
                return
            }
            let dataset = try SyntheticDataset.load(from: Data(contentsOf: url))
            let support = try FileManager.default.url(
                for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil,
                create: true)
            let stateURL =
                support
                .appendingPathComponent("IEPAssistantPrototype", isDirectory: true)
                .appendingPathComponent("state.json")
            store = PrototypeStore(dataset: dataset, stateURL: stateURL)
        } catch {
            loadError = "The demo district could not be loaded: \(error)"
        }
    }
}
