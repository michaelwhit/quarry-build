import CoreModels
import Foundation
import Observation

/// The prototype's whole data layer: the synthetic district held in memory, plus what the person
/// using the app adds (data points and approved progress entries), saved to one JSON file.
///
/// This is a stand-in for the encrypted GRDB store and the sync engine that Track 2 builds. Views
/// depend on this API, so swapping the implementation later does not change the screens. It holds
/// fake students only; there is no network and no real sign-in.
@MainActor
@Observable
public final class PrototypeStore {
    public enum StoreError: Error, Equatable {
        case notSignedIn
        case notAllowed
        case invalidDataPoint(DataPointValidationError)
        case unknownPlan
        case saveFailed
    }

    private struct SavedState: Codable {
        var deviceID: UUID
        var points: [DataPoint]
        var approvals: [ProgressApproval]

        enum CodingKeys: String, CodingKey {
            case points, approvals
            case deviceID = "device_id"
        }
    }

    public let dataset: SyntheticDataset
    public let deviceID: UUID
    public private(set) var currentStaff: Staff?
    public private(set) var addedPoints: [DataPoint]
    public private(set) var approvals: [UUID: ProgressApproval]
    @ObservationIgnored private let stateURL: URL?
    @ObservationIgnored private let calendarToday: @Sendable () -> LocalDate

    /// - Parameters:
    ///   - dataset: the synthetic district to browse.
    ///   - stateURL: where to save what the user adds; nil keeps everything in memory.
    ///   - today: the date used to decide which caseload assignments are active.
    public init(
        dataset: SyntheticDataset, stateURL: URL? = nil,
        today: @escaping @Sendable () -> LocalDate = PrototypeStore.systemToday
    ) {
        self.dataset = dataset
        self.stateURL = stateURL
        self.calendarToday = today
        var device = UUIDv7.make()
        var points: [DataPoint] = []
        var approvals: [UUID: ProgressApproval] = [:]
        if let stateURL, let data = try? Data(contentsOf: stateURL),
            let saved = try? JSONDecoder.coreModels.decode(SavedState.self, from: data)
        {
            device = saved.deviceID
            points = saved.points
            approvals = Dictionary(
                saved.approvals.map { ($0.goalID, $0) }, uniquingKeysWith: { _, newer in newer })
        }
        self.deviceID = device
        self.addedPoints = points
        self.approvals = approvals
    }

    public nonisolated static func systemToday() -> LocalDate {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        return LocalDate(
            year: parts.year ?? 2026, month: parts.month ?? 1, day: parts.day ?? 1)
            ?? LocalDate(year: 2026, month: 1, day: 1)!
    }

    // MARK: Demo sign-in

    /// Staff who can be chosen in a demo build. Real Google sign-in replaces this (Track 1).
    public var demoStaff: [Staff] {
        dataset.staff.sorted { ($0.role.title, $0.displayName) < ($1.role.title, $1.displayName) }
    }

    public func signIn(as staff: Staff) {
        currentStaff = staff
    }

    public func signOut() {
        currentStaff = nil
    }

    // MARK: What the signed-in person may see and do

    /// Students in the signed-in person's scope: the whole district for the director and building
    /// coordinator, otherwise only active caseload, service or roster assignments (security 3.1).
    public var visibleStudents: [Student] {
        guard let staff = currentStaff else { return [] }
        let all = dataset.students
        let scoped: [Student]
        switch staff.role {
        case .spedDirector, .buildingCoordinator:
            scoped = all
        case .districtITAdmin, .vendorSupport:
            scoped = []
        default:
            let today = calendarToday()
            let ids = Set(
                dataset.caseloadAssignments
                    .filter { $0.staffID == staff.id && $0.isActive(on: today) }
                    .map(\.studentID))
            scoped = all.filter { ids.contains($0.id) }
        }
        return scoped.sorted { ($0.lastName, $0.firstName) < ($1.lastName, $1.firstName) }
    }

    public var canRecordData: Bool {
        switch currentStaff?.role {
        case .spedDirector, .buildingCoordinator, .caseManager, .relatedServiceProvider,
            .genEdTeacher, .paraprofessional:
            true
        default:
            false
        }
    }

    /// Prototype default: AI drafting for case managers, related-service providers and the
    /// director. The district later chooses which roles get it (security 3.3).
    public var canUseAI: Bool {
        switch currentStaff?.role {
        case .spedDirector, .caseManager, .relatedServiceProvider: true
        default: false
        }
    }

    // MARK: Reading records

    public func school(for student: Student) -> School? {
        dataset.schools.first { $0.id == student.schoolID }
    }

    public func goals(for student: Student) -> [Goal] {
        let iepIDs = Set(dataset.ieps.filter { $0.studentID == student.id }.map(\.id))
        return dataset.goals.filter { iepIDs.contains($0.iepID) }.sorted { $0.sequence < $1.sequence }
    }

    public func student(for goal: Goal) -> Student? {
        guard let iep = dataset.ieps.first(where: { $0.id == goal.iepID }) else { return nil }
        return dataset.students.first { $0.id == iep.studentID }
    }

    public func plan(for goal: Goal) -> MeasurementPlan? {
        dataset.measurementPlans.first { $0.goalID == goal.id }
    }

    public func dataPoints(for goal: Goal) -> [DataPoint] {
        (dataset.dataPoints + addedPoints)
            .filter { $0.goalID == goal.id }
            .sorted { $0.observedAt < $1.observedAt }
    }

    public func progress(for goal: Goal) -> GoalProgress? {
        guard let plan = plan(for: goal) else { return nil }
        return GoalProgress(plan: plan, dataPoints: dataPoints(for: goal))
    }

    public func staffName(_ id: UUID) -> String {
        dataset.staff.first { $0.id == id }?.displayName ?? "Unknown"
    }

    public func approval(for goal: Goal) -> ProgressApproval? {
        approvals[goal.id]
    }

    // MARK: Changing records

    /// Records one observation made by the signed-in person after checking it against the plan.
    @discardableResult
    public func record(
        goal: Goal, observedAt: Date = Date(), valueNum: Double? = nil, correct: Int? = nil,
        total: Int? = nil, promptLevel: String? = nil, stepResults: [Bool]? = nil,
        note: String? = nil
    ) throws -> DataPoint {
        guard let staff = currentStaff else { throw StoreError.notSignedIn }
        guard canRecordData else { throw StoreError.notAllowed }
        guard let plan = plan(for: goal) else { throw StoreError.unknownPlan }
        let trimmed = note?.trimmingCharacters(in: .whitespacesAndNewlines)
        let point = DataPoint(
            tenantID: goal.tenantID, goalID: goal.id, planID: plan.id, observedAt: observedAt,
            valueNum: valueNum, correct: correct, total: total, promptLevel: promptLevel,
            stepResults: stepResults, setting: nil,
            note: (trimmed?.isEmpty ?? true) ? nil : trimmed, collectorID: staff.id,
            deviceID: deviceID)
        do {
            try point.validate(against: plan)
        } catch let error as DataPointValidationError {
            throw StoreError.invalidDataPoint(error)
        }
        addedPoints.append(point)
        save()
        return point
    }

    /// Stores the data points a collection session produced. A point whose id is already stored is
    /// skipped, so delivering the same session twice (a crash between delivery and clearing the
    /// draft) never doubles the data. Nothing is stored if any new point is out of scope or fails
    /// its plan, so a session lands whole or not at all. Returns how many points were new.
    @discardableResult
    public func addPoints(_ points: [DataPoint]) throws -> Int {
        guard let staff = currentStaff else { throw StoreError.notSignedIn }
        guard canRecordData else { throw StoreError.notAllowed }
        let visible = Set(visibleStudents.map(\.id))
        var seen = Set(addedPoints.map(\.id))
        var fresh: [DataPoint] = []
        for point in points where !seen.contains(point.id) {
            guard let goal = dataset.goals.first(where: { $0.id == point.goalID }),
                let owner = student(for: goal), visible.contains(owner.id)
            else { throw StoreError.notAllowed }
            // The recorder must be the signed-in person, in the goal's own tenant.
            guard point.collectorID == staff.id, point.tenantID == goal.tenantID else {
                throw StoreError.notAllowed
            }
            guard let plan = plan(for: goal), plan.id == point.planID else {
                throw StoreError.unknownPlan
            }
            do {
                try point.validate(against: plan)
            } catch let error as DataPointValidationError {
                throw StoreError.invalidDataPoint(error)
            }
            seen.insert(point.id)
            fresh.append(point)
        }
        guard !fresh.isEmpty else { return 0 }
        // Success means the points are on disk. If the write fails, roll back so the caller keeps
        // its draft and nothing exists only in memory.
        let before = addedPoints
        addedPoints.append(contentsOf: fresh)
        do {
            try write()
        } catch {
            addedPoints = before
            throw StoreError.saveFailed
        }
        return fresh.count
    }

    /// Stores the teacher's approved answer for a goal, replacing any earlier one.
    public func approve(
        goal: Goal, sufficient: Bool, comment: String, aiSuggestedSufficient: Bool?,
        aiSuggestedComment: String?, provider: String?
    ) throws {
        guard let staff = currentStaff else { throw StoreError.notSignedIn }
        guard canUseAI || aiSuggestedComment == nil else { throw StoreError.notAllowed }
        guard let student = student(for: goal) else { throw StoreError.unknownPlan }
        let edited = aiSuggestedComment.map { $0 != comment } ?? false
        approvals[goal.id] = ProgressApproval(
            goalID: goal.id, studentID: student.id, sufficient: sufficient, comment: comment,
            aiSuggestedSufficient: aiSuggestedSufficient, aiSuggestedComment: aiSuggestedComment,
            wasEdited: edited || (aiSuggestedSufficient.map { $0 != sufficient } ?? false),
            approvedBy: staff.id, provider: provider)
        save()
    }

    public func removeApproval(for goal: Goal) {
        approvals[goal.id] = nil
        save()
    }

    /// Deletes everything the user added, keeping the synthetic district.
    public func resetLocalData() {
        addedPoints = []
        approvals = [:]
        save()
    }

    private func save() {
        do {
            try write()
        } catch {
            // Losing a prototype save must not crash the demo; the in-memory copy stays correct.
            assertionFailure("could not save prototype state")
        }
    }

    private func write() throws {
        guard let stateURL else { return }
        let state = SavedState(
            deviceID: deviceID, points: addedPoints,
            approvals: approvals.values.sorted { $0.approvedAt < $1.approvedAt })
        try FileManager.default.createDirectory(
            at: stateURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        let data = try JSONEncoder.coreModels.encode(state)
        #if os(iOS)
            try data.write(to: stateURL, options: [.atomic, .completeFileProtection])
        #else
            try data.write(to: stateURL, options: [.atomic])
        #endif
    }
}
