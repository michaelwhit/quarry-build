import CoreModels
import Foundation
import Observation

/// The prototype's whole data layer: the synthetic district held in memory, plus what the person
/// using the app adds (data points and approved progress entries), saved to one JSON file.
///
/// This is a stand-in for the encrypted GRDB store and the sync engine that comes later. Views
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
        case unknownSchool
        case invalidStudent(StudentFieldError)
        case invalidBatchEntry(index: Int, problem: BatchEntryProblem)
        case saveFailed
    }

    /// Why one entry of a batch was refused.
    public enum BatchEntryProblem: Error, Equatable {
        case unknownSchool
        case field(StudentFieldError)
    }

    /// What was wrong with a student the user typed in.
    public enum StudentFieldError: Error, Equatable {
        case firstNameMissing
        case lastNameMissing
        case gradeMissing
        case nameTooLong
    }

    /// Why a practice-data file could not be read.
    public enum FileError: Error, Equatable {
        case tooLarge
        case notAPracticeFile
        case noSessions
    }

    /// The most a practice-data file may hold, so a wrong file is refused before it is parsed.
    public static let maxPracticeFileBytes = 4_000_000

    /// What "Save practice data to a file" writes: the sessions recorded here, the students typed in
    /// by hand with their caseload links, and the edits made to students. The `synthetic` flag and
    /// `app` name let the loader refuse any other file. Version 1 files hold sessions only and still
    /// load; the student fields are absent there.
    private struct PracticeFile: Codable {
        var synthetic: Bool
        var app: String
        var version: Int
        var points: [DataPoint]
        var students: [Student]?
        var assignments: [CaseloadAssignment]?
        var studentEdits: [Student]?

        enum CodingKeys: String, CodingKey {
            case synthetic, app, version, points, students, assignments
            case studentEdits = "student_edits"
        }
    }

    /// What loading a practice-data file changed.
    public struct PracticeImport: Equatable, Sendable {
        public var sessions: Int
        public var students: Int
        /// Students whose name, grade or school the file changed.
        public var edits: Int
    }

    /// The most students a practice-data file may add.
    public static let maxImportedStudents = 500

    private static let practiceFileApp = "goalline-practice"

    private struct SavedState: Codable {
        var deviceID: UUID
        var points: [DataPoint]
        var approvals: [ProgressApproval]
        // Added after the first release; older files simply lack them.
        var students: [Student]?
        var assignments: [CaseloadAssignment]?
        var studentEdits: [Student]?

        enum CodingKeys: String, CodingKey {
            case points, approvals, students, assignments
            case deviceID = "device_id"
            case studentEdits = "student_edits"
        }
    }

    public let dataset: SyntheticDataset
    public let deviceID: UUID
    public private(set) var currentStaff: Staff?
    public private(set) var addedPoints: [DataPoint]
    public private(set) var approvals: [UUID: ProgressApproval]
    /// Students typed in by hand, and the caseload links that put them on a person's list.
    public private(set) var addedStudents: [Student]
    public private(set) var addedAssignments: [CaseloadAssignment]
    /// Changes to students already in the district or added by hand, keyed by student id.
    public private(set) var studentEdits: [UUID: Student]
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
        var students: [Student] = []
        var assignments: [CaseloadAssignment] = []
        var edits: [UUID: Student] = [:]
        if let stateURL, let data = try? Data(contentsOf: stateURL),
            let saved = try? JSONDecoder.coreModels.decode(SavedState.self, from: data)
        {
            device = saved.deviceID
            points = saved.points
            approvals = Dictionary(
                saved.approvals.map { ($0.goalID, $0) }, uniquingKeysWith: { _, newer in newer })
            students = saved.students ?? []
            assignments = saved.assignments ?? []
            edits = Dictionary(
                (saved.studentEdits ?? []).map { ($0.id, $0) }, uniquingKeysWith: { _, newer in newer })
        }
        self.deviceID = device
        self.addedPoints = points
        self.approvals = approvals
        self.addedStudents = students
        self.addedAssignments = assignments
        self.studentEdits = edits
    }

    public nonisolated static func systemToday() -> LocalDate {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        return LocalDate(
            year: parts.year ?? 2026, month: parts.month ?? 1, day: parts.day ?? 1)
            ?? LocalDate(year: 2026, month: 1, day: 1)!
    }

    // MARK: Demo sign-in

    /// Staff who can be chosen in a demo build. Real Google sign-in replaces this.
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
        let all = allStudents
        let scoped: [Student]
        switch staff.role {
        case .spedDirector, .buildingCoordinator:
            scoped = all
        case .districtITAdmin, .vendorSupport:
            scoped = []
        default:
            let today = calendarToday()
            let ids = Set(
                (dataset.caseloadAssignments + addedAssignments)
                    .filter { $0.staffID == staff.id && $0.isActive(on: today) }
                    .map(\.studentID))
            scoped = all.filter { ids.contains($0.id) }
        }
        return scoped.sorted { ($0.lastName, $0.firstName) < ($1.lastName, $1.firstName) }
    }

    /// Everyone in the district plus anyone added by hand, with edits applied.
    public var allStudents: [Student] {
        (dataset.students + addedStudents).map { studentEdits[$0.id] ?? $0 }
    }

    /// Who may add a student by hand or fix one on their list. Prototype default; the district
    /// later chooses.
    public var canManageStudents: Bool {
        switch currentStaff?.role {
        case .spedDirector, .buildingCoordinator, .caseManager: true
        default: false
        }
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

    /// Whether the signed-in role may save sessions to a file or load them from one. Follows the
    /// role matrix's export permission, so paraprofessionals, gen-ed teachers and related-service
    /// providers have neither.
    public var canExportFiles: Bool {
        currentStaff.map { RoleCapabilities.proposedDefaults(for: $0.role).canExport } ?? false
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
        return allStudents.first { $0.id == iep.studentID }
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

    /// Adds a student by hand and puts them on the signed-in person's caseload.
    @discardableResult
    public func addStudent(
        firstName: String, lastName: String, preferredName: String? = nil, grade: String,
        schoolID: UUID
    ) throws -> Student {
        guard let staff = currentStaff else { throw StoreError.notSignedIn }
        guard canManageStudents else { throw StoreError.notAllowed }
        guard dataset.schools.contains(where: { $0.id == schoolID }) else {
            throw StoreError.unknownSchool
        }
        let fields = try Self.cleaned(
            firstName: firstName, lastName: lastName, preferredName: preferredName, grade: grade)
        let student = Student(
            id: UUIDv7.make(), tenantID: staff.tenantID, schoolID: schoolID,
            firstName: fields.first, lastName: fields.last, preferredName: fields.preferred,
            grade: fields.grade)
        let link = CaseloadAssignment(
            id: UUIDv7.make(), tenantID: staff.tenantID, staffID: staff.id,
            studentID: student.id, relationship: .caseload, grantedBy: staff.id,
            startDate: calendarToday())
        let before = (addedStudents, addedAssignments)
        addedStudents.append(student)
        addedAssignments.append(link)
        do {
            try write()
        } catch {
            (addedStudents, addedAssignments) = before
            throw StoreError.saveFailed
        }
        return student
    }

    /// One student to add as part of a batch, such as a row of an imported file.
    public struct NewStudent: Equatable, Sendable {
        public var firstName: String
        public var lastName: String
        public var preferredName: String?
        public var grade: String
        public var schoolID: UUID

        public init(
            firstName: String, lastName: String, preferredName: String? = nil, grade: String,
            schoolID: UUID
        ) {
            self.firstName = firstName
            self.lastName = lastName
            self.preferredName = preferredName
            self.grade = grade
            self.schoolID = schoolID
        }
    }

    /// Adds several students at once and puts them all on the signed-in person's caseload, with a
    /// single save. Nothing is added if any entry fails its checks, or if the save fails. A failed
    /// entry is reported with its position in `entries` through `StoreError.invalidBatchEntry`.
    @discardableResult
    public func addStudents(_ entries: [NewStudent]) throws -> [Student] {
        guard let staff = currentStaff else { throw StoreError.notSignedIn }
        guard canManageStudents else { throw StoreError.notAllowed }
        let schools = Set(dataset.schools.map(\.id))
        let today = calendarToday()
        var students: [Student] = []
        var links: [CaseloadAssignment] = []
        for (index, entry) in entries.enumerated() {
            guard schools.contains(entry.schoolID) else {
                throw StoreError.invalidBatchEntry(index: index, problem: .unknownSchool)
            }
            let fields: (first: String, last: String, preferred: String?, grade: String)
            do {
                fields = try Self.cleaned(
                    firstName: entry.firstName, lastName: entry.lastName,
                    preferredName: entry.preferredName, grade: entry.grade)
            } catch StoreError.invalidStudent(let field) {
                throw StoreError.invalidBatchEntry(index: index, problem: .field(field))
            }
            let student = Student(
                id: UUIDv7.make(), tenantID: staff.tenantID, schoolID: entry.schoolID,
                firstName: fields.first, lastName: fields.last, preferredName: fields.preferred,
                grade: fields.grade)
            students.append(student)
            links.append(
                CaseloadAssignment(
                    id: UUIDv7.make(), tenantID: staff.tenantID, staffID: staff.id,
                    studentID: student.id, relationship: .caseload, grantedBy: staff.id,
                    startDate: today))
        }
        guard !students.isEmpty else { return [] }
        let before = (addedStudents, addedAssignments)
        addedStudents.append(contentsOf: students)
        addedAssignments.append(contentsOf: links)
        do {
            try write()
        } catch {
            (addedStudents, addedAssignments) = before
            throw StoreError.saveFailed
        }
        return students
    }

    /// Fixes the name, grade or school of a student on the signed-in person's list.
    @discardableResult
    public func updateStudent(
        id: UUID, firstName: String, lastName: String, preferredName: String? = nil,
        grade: String, schoolID: UUID
    ) throws -> Student {
        guard currentStaff != nil else { throw StoreError.notSignedIn }
        guard canManageStudents else { throw StoreError.notAllowed }
        guard let current = visibleStudents.first(where: { $0.id == id }) else {
            throw StoreError.notAllowed
        }
        guard dataset.schools.contains(where: { $0.id == schoolID }) else {
            throw StoreError.unknownSchool
        }
        let fields = try Self.cleaned(
            firstName: firstName, lastName: lastName, preferredName: preferredName, grade: grade)
        var changed = current
        changed.firstName = fields.first
        changed.lastName = fields.last
        changed.preferredName = fields.preferred
        changed.grade = fields.grade
        changed.schoolID = schoolID
        let before = studentEdits
        studentEdits[id] = changed
        do {
            try write()
        } catch {
            studentEdits = before
            throw StoreError.saveFailed
        }
        return changed
    }

    /// Longest first, last or preferred name accepted.
    public static let maxNameLength = 100

    private static func cleaned(
        firstName: String, lastName: String, preferredName: String?, grade: String
    ) throws -> (first: String, last: String, preferred: String?, grade: String) {
        let first = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        let last = lastName.trimmingCharacters(in: .whitespacesAndNewlines)
        let nick = preferredName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let level = grade.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !first.isEmpty else { throw StoreError.invalidStudent(.firstNameMissing) }
        guard !last.isEmpty else { throw StoreError.invalidStudent(.lastNameMissing) }
        guard !level.isEmpty else { throw StoreError.invalidStudent(.gradeMissing) }
        guard [first, last, nick ?? ""].allSatisfy({ $0.count <= Self.maxNameLength }) else {
            throw StoreError.invalidStudent(.nameTooLong)
        }
        return (first, last, (nick?.isEmpty ?? true) ? nil : nick, level)
    }

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

    /// Removes one session someone recorded by mistake. Only data added in the app can go; the
    /// synthetic district's own points stay. Removing an id that is not there does nothing.
    public func removeAddedPoint(id: UUID) throws {
        guard currentStaff != nil else { throw StoreError.notSignedIn }
        guard canRecordData else { throw StoreError.notAllowed }
        guard let point = addedPoints.first(where: { $0.id == id }) else { return }
        guard let goal = dataset.goals.first(where: { $0.id == point.goalID }),
            let owner = student(for: goal), visibleStudents.contains(where: { $0.id == owner.id })
        else { throw StoreError.notAllowed }
        let before = addedPoints
        addedPoints.removeAll { $0.id == id }
        do {
            try write()
        } catch {
            addedPoints = before
            throw StoreError.saveFailed
        }
    }

    /// The sessions recorded here for students the signed-in person may see.
    private var exportablePoints: [DataPoint] {
        let visible = Set(visibleStudents.map(\.id))
        return addedPoints.filter { point in
            dataset.goals.first { $0.id == point.goalID }
                .flatMap { student(for: $0) }
                .map { visible.contains($0.id) } ?? false
        }
    }

    /// How many sessions a saved file would hold, so a screen can leave Save off when it is none.
    public var exportableSessionCount: Int { exportablePoints.count }

    /// Sessions, hand-added students and student edits a saved file would hold.
    public var exportableItemCount: Int {
        let visibleIDs = Set(visibleStudents.map(\.id))
        return exportablePoints.count + addedStudents.filter { visibleIDs.contains($0.id) }.count
            + studentEdits.values.filter { visibleIDs.contains($0.id) }.count
    }

    /// Every session recorded here for students the signed-in person may see, newest first, with the
    /// students typed in by hand and the edits to students on that person's list, as the text of a
    /// practice-data file. Fake data only; the file says so.
    public func exportPracticeData() throws -> Data {
        guard currentStaff != nil else { throw StoreError.notSignedIn }
        guard canExportFiles else { throw StoreError.notAllowed }
        let visibleIDs = Set(visibleStudents.map(\.id))
        let students = addedStudents.filter { visibleIDs.contains($0.id) }
        let studentIDs = Set(students.map(\.id))
        let file = PracticeFile(
            synthetic: true, app: Self.practiceFileApp, version: 2,
            points: exportablePoints.sorted { $0.observedAt > $1.observedAt },
            students: students,
            assignments: addedAssignments.filter { studentIDs.contains($0.studentID) },
            studentEdits: studentEdits.values.filter { visibleIDs.contains($0.id) }
                .sorted { $0.id.uuidString < $1.id.uuidString })
        return try JSONEncoder.coreModels.encode(file)
    }

    /// Adds the sessions from a file made by `exportPracticeData`. Sessions already here (same id)
    /// are skipped, so loading the same file twice changes nothing. The file lands whole or not at
    /// all: one session that is out of scope or fails its plan refuses the file. Returns how many
    /// sessions were new.
    @discardableResult
    public func importPracticeData(_ data: Data) throws -> Int {
        try importPractice(data).sessions
    }

    /// Like `importPracticeData`, and also adds the students in a version 2 file. Students already
    /// here are skipped; a file never overwrites or removes one. New students keep only their name,
    /// grade and school (no ids or birth date). Anyone but the director and building coordinator
    /// gets every new student on their own caseload, and caseload links the file holds for other
    /// people are ignored, so a file cannot hand students to someone else. Edits in the file apply to
    /// students the signed-in person can see. The file lands whole or not at all.
    @discardableResult
    public func importPractice(_ data: Data) throws -> PracticeImport {
        guard let staff = currentStaff else { throw StoreError.notSignedIn }
        guard canExportFiles else { throw StoreError.notAllowed }
        guard data.count <= Self.maxPracticeFileBytes else { throw FileError.tooLarge }
        guard let file = try? JSONDecoder.coreModels.decode(PracticeFile.self, from: data),
            file.synthetic, file.app == Self.practiceFileApp, file.version == 1 || file.version == 2
        else { throw FileError.notAPracticeFile }
        let incoming = file.students ?? []
        let incomingLinks = file.assignments ?? []
        let incomingEdits = file.studentEdits ?? []
        if file.version == 1 && !(incoming.isEmpty && incomingLinks.isEmpty && incomingEdits.isEmpty) {
            throw FileError.notAPracticeFile
        }
        guard !file.points.isEmpty || !incoming.isEmpty || !incomingEdits.isEmpty else {
            throw FileError.noSessions
        }
        guard incoming.count <= Self.maxImportedStudents,
            incomingLinks.count <= Self.maxImportedStudents * 4,
            incomingEdits.count <= Self.maxImportedStudents * 2
        else { throw FileError.notAPracticeFile }
        if !incoming.isEmpty || !incomingEdits.isEmpty {
            guard canManageStudents else { throw StoreError.notAllowed }
        }
        // The same checks as a session delivered by the app, except the recorder: a file may hold
        // sessions another person recorded on this device, as long as they are in the district.
        if !file.points.isEmpty { guard canRecordData else { throw StoreError.notAllowed } }

        let before = (addedStudents, addedAssignments, studentEdits, addedPoints)
        var finished = false
        defer {
            if !finished { (addedStudents, addedAssignments, studentEdits, addedPoints) = before }
        }

        let staffIDs = Set(dataset.staff.map(\.id))
        let schoolIDs = Set(dataset.schools.map(\.id))
        let knownStudents = Set(allStudents.map(\.id))
        var freshStudents: [Student] = []
        var freshIDs = Set<UUID>()
        for student in incoming where !knownStudents.contains(student.id) {
            guard freshIDs.insert(student.id).inserted, student.tenantID == staff.tenantID,
                schoolIDs.contains(student.schoolID),
                let fields = try? Self.cleaned(
                    firstName: student.firstName, lastName: student.lastName,
                    preferredName: student.preferredName, grade: student.grade)
            else { throw FileError.notAPracticeFile }
            freshStudents.append(
                Student(
                    id: student.id, tenantID: staff.tenantID, schoolID: student.schoolID,
                    firstName: fields.first, lastName: fields.last, preferredName: fields.preferred,
                    grade: fields.grade))
        }

        let seesAll = staff.role == .spedDirector || staff.role == .buildingCoordinator
        var linkIDs = Set((dataset.caseloadAssignments + addedAssignments).map(\.id))
        var freshLinks: [CaseloadAssignment] = []
        for link in incomingLinks where freshIDs.contains(link.studentID) {
            guard link.relationship == .caseload, link.tenantID == staff.tenantID,
                staffIDs.contains(link.staffID), staffIDs.contains(link.grantedBy),
                seesAll || link.staffID == staff.id, linkIDs.insert(link.id).inserted
            else { continue }
            freshLinks.append(link)
        }
        if !seesAll {
            for student in freshStudents
            where !freshLinks.contains(where: { $0.studentID == student.id && $0.staffID == staff.id }) {
                freshLinks.append(
                    CaseloadAssignment(
                        id: UUIDv7.make(), tenantID: staff.tenantID, staffID: staff.id,
                        studentID: student.id, relationship: .caseload, grantedBy: staff.id,
                        startDate: calendarToday()))
            }
        }
        addedStudents.append(contentsOf: freshStudents)
        addedAssignments.append(contentsOf: freshLinks)

        var editCount = 0
        for edit in incomingEdits {
            guard let base = visibleStudents.first(where: { $0.id == edit.id }),
                schoolIDs.contains(edit.schoolID),
                let fields = try? Self.cleaned(
                    firstName: edit.firstName, lastName: edit.lastName,
                    preferredName: edit.preferredName, grade: edit.grade)
            else { throw FileError.notAPracticeFile }
            var changed = base
            changed.firstName = fields.first
            changed.lastName = fields.last
            changed.preferredName = fields.preferred
            changed.grade = fields.grade
            changed.schoolID = edit.schoolID
            if changed != base {
                studentEdits[edit.id] = changed
                editCount += 1
            }
        }

        let visible = Set(visibleStudents.map(\.id))
        var seen = Set(addedPoints.map(\.id))
        var fresh: [DataPoint] = []
        for point in file.points where !seen.contains(point.id) {
            guard let goal = dataset.goals.first(where: { $0.id == point.goalID }),
                let owner = student(for: goal), visible.contains(owner.id),
                point.tenantID == goal.tenantID, staffIDs.contains(point.collectorID)
            else { throw FileError.notAPracticeFile }
            guard let plan = plan(for: goal), plan.id == point.planID else {
                throw FileError.notAPracticeFile
            }
            do {
                try point.validate(against: plan)
            } catch {
                throw FileError.notAPracticeFile
            }
            seen.insert(point.id)
            fresh.append(point)
        }
        let result = PracticeImport(
            sessions: fresh.count, students: freshStudents.count, edits: editCount)
        guard result != PracticeImport(sessions: 0, students: 0, edits: 0) else {
            finished = true
            return result
        }
        addedPoints.append(contentsOf: fresh)
        do {
            try write()
        } catch {
            throw StoreError.saveFailed
        }
        finished = true
        return result
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
        addedStudents = []
        addedAssignments = []
        studentEdits = [:]
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
            approvals: approvals.values.sorted { $0.approvedAt < $1.approvedAt },
            students: addedStudents, assignments: addedAssignments,
            studentEdits: studentEdits.values.sorted { $0.id.uuidString < $1.id.uuidString })
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
