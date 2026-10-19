import CoreModels
import Persistence

/// The caseload in five numbers. Home and the Caseload summary both read this, so a number on
/// Home is always the same number on the screen it opens.
public struct CaseloadSummary: Equatable, Sendable {
    public var students = 0
    public var goals = 0
    public var onTrack = 0
    public var needsLook = 0
    public var approved = 0

    public init() {}

    @MainActor
    public init(store: PrototypeStore) {
        let visible = store.visibleStudents
        students = visible.count
        for student in visible {
            for goal in store.goals(for: student) {
                guard let progress = store.progress(for: goal) else { continue }
                goals += 1
                switch progress.suggestedSufficient {
                case true?: onTrack += 1
                case false?: needsLook += 1
                case nil: break
                }
                if store.approval(for: goal) != nil { approved += 1 }
            }
        }
    }
}
