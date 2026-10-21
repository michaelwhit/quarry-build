import CoreModels
import Foundation

/// One goal as the read-only At a glance page shows it: the whole goal text and how it is
/// measured. No baseline, no data points.
public struct GlanceGoal: Identifiable, Equatable, Sendable {
    public let id: UUID
    /// "Reading", "Math" and so on.
    public let title: String
    /// The whole goal text, never shortened.
    public let text: String
    /// "Measured by: percent correct. Target: 80%", or nil when neither is on file.
    public let measuredLine: String?
}

/// One student as the At a glance page and the My students list show them.
public struct GlanceStudent: Identifiable, Equatable, Sendable {
    public let id: UUID
    public let name: String
    public let grade: String
    public let school: String?
    public let caseManager: String?
    public let goals: [GlanceGoal]
}

extension PrototypeStore {
    /// The students a teacher with a read-only view may open: the ones on the signed-in person's
    /// list, sorted by last name. Nothing else is reachable from here.
    public var glanceStudents: [GlanceStudent] {
        visibleStudents.map(glance)
    }

    /// One student for At a glance, or nil when this person no longer has the student (the screen
    /// says "This student is no longer shared with you.").
    public func glanceStudent(id: UUID) -> GlanceStudent? {
        visibleStudents.first { $0.id == id }.map(glance)
    }

    /// The goals handed to the signed-in person that are still in force. A page that shows goals to
    /// a teacher or para reads only these, never every goal on the student's IEP.
    public var delegatedGoalIDs: Set<UUID> {
        guard let staff = currentStaff else { return [] }
        let now = Date()
        return Set(
            dataset.goalDelegations
                .filter { $0.staffID == staff.id && $0.isActive(at: now) }
                .map(\.goalID))
    }

    private func glance(_ student: Student) -> GlanceStudent {
        let delegated = delegatedGoalIDs
        let today = calendarToday()
        let manager = (dataset.caseloadAssignments + addedAssignments)
            .first {
                $0.studentID == student.id && $0.relationship == .caseload && $0.isActive(on: today)
            }
            .map { staffName($0.staffID) }
        let name =
            roleView.showsFullNames
            ? "\(student.firstName) \(student.lastName)" : displayName(for: student)
        let shownGoals = goals(for: student).filter { delegated.contains($0.id) }.map { goal -> GlanceGoal in
            let shown = displayGoal(goal, for: student)
            var parts: [String] = []
            if let plan = plan(for: goal) { parts.append("Measured by: \(plan.type.title.lowercased()).") }
            if let target = shown.target, !target.isEmpty { parts.append("Target: \(target)") }
            return GlanceGoal(
                id: goal.id, title: goal.area.title, text: shown.statement,
                measuredLine: parts.isEmpty ? nil : parts.joined(separator: " "))
        }
        return GlanceStudent(
            id: student.id, name: name, grade: student.grade,
            school: school(for: student)?.name.replacingOccurrences(of: " (synthetic)", with: ""),
            caseManager: manager, goals: shownGoals)
    }
}
