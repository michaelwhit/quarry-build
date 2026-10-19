import CoreModels
import Foundation

/// A goal as the session screens need it: who, what, how it is measured, and its past data.
/// The app builds these from the store, so the screens do not depend on where data lives.
public struct SessionGoal: Identifiable, Hashable, Sendable {
    public var student: Student
    public var goal: Goal
    public var plan: MeasurementPlan
    public var history: [DataPoint]

    public var id: UUID { goal.id }

    public init(student: Student, goal: Goal, plan: MeasurementPlan, history: [DataPoint] = []) {
        self.student = student
        self.goal = goal
        self.plan = plan
        self.history = history
    }

    /// The plotted values of past sessions, oldest first (the same series the goal graph uses).
    public var pastSeries: [Double] {
        GoalProgress(plan: plan, dataPoints: history).samples.map(\.value)
    }

    public var lastDataAt: Date? {
        history.filter { $0.planID == plan.id }.map(\.observedAt).max()
    }

    public var isSupported: Bool { SessionDraft.supports(plan.type) }
}

extension SessionDraft {
    /// Starts a session for the goals the session screen can run. Goals with other measures are
    /// left out; the caller shows `SessionGoal.isSupported` so the teacher knows why.
    public static func start(
        goals: [SessionGoal], setting: String? = nil, at now: Date
    ) -> SessionDraft {
        let entries = goals.filter(\.isSupported).map { item in
            SessionEntry(
                studentID: item.student.id, goalID: item.goal.id, planID: item.plan.id,
                type: item.plan.type, plannedTrials: item.plan.trialsPerSession,
                promptHierarchy: item.plan.promptHierarchy)
        }
        return SessionDraft(startedAt: now, setting: setting, entries: entries)
    }
}

/// Initials and a color for the privacy toggle, so a screen a student can see shows no names.
public enum PrivacyLabel {
    /// "L.M." from first and last name, or "?" when both are empty.
    public static func initials(for student: Student) -> String {
        let first = student.firstName.first.map { String($0).uppercased() }
        let last = student.lastName.first.map { String($0).uppercased() }
        let letters = [first, last].compactMap { $0 }
        guard !letters.isEmpty else { return "?" }
        return letters.map { $0 + "." }.joined()
    }

    public static func label(for student: Student, hidden: Bool) -> String {
        hidden ? initials(for: student) : student.displayName
    }

    /// Goal statements usually open with the student's name. When names are hidden, each name
    /// (full, first, last, preferred) becomes the student's initials, so nothing on screen names them.
    public static func text(_ text: String, for student: Student, hidden: Bool) -> String {
        guard hidden else { return text }
        let initials = initials(for: student)
        var names = ["\(student.firstName) \(student.lastName)"]
        names.append(contentsOf: [student.firstName, student.lastName, student.preferredName ?? ""])
        var result = text
        for name in names.sorted(by: { $0.count > $1.count }) where !name.trimmingCharacters(in: .whitespaces).isEmpty {
            // Whole words only, so a short name such as "Max" leaves "maximum" alone.
            let pattern = "\\b" + NSRegularExpression.escapedPattern(for: name) + "\\b"
            result = result.replacingOccurrences(
                of: pattern, with: NSRegularExpression.escapedTemplate(for: initials),
                options: [.regularExpression, .caseInsensitive])
        }
        return result
    }

    /// A stable hue (0 up to 1) for the student, so a chip keeps its color all day.
    public static func hue(for id: UUID) -> Double {
        let bytes = withUnsafeBytes(of: id.uuid) { Array($0) }
        let sum = bytes.reduce(0) { ($0 &* 31 &+ Int($1)) % 360 }
        return Double(sum) / 360
    }
}
