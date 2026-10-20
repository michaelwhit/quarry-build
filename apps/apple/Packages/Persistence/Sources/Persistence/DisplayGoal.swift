import CoreModels
import Foundation

extension PrototypeStore {
    /// A copy of the goal safe to show a role that sees first names only. The student's full name
    /// becomes the first or preferred name, and the last name and student ids are taken out of
    /// every text field. Everyone else gets the goal as it is.
    public func displayGoal(_ goal: Goal, for student: Student) -> Goal {
        guard !roleView.showsFullNames else { return goal }
        let shown = Self.firstNameOnly(student)
        func clean(_ text: String) -> String {
            Self.scrubbed(text, of: student, shownAs: shown)
        }
        var copy = goal
        copy.statement = clean(goal.statement)
        copy.condition = goal.condition.map(clean)
        copy.behavior = goal.behavior.map(clean)
        copy.baseline = goal.baseline.map(clean)
        copy.target = goal.target.map(clean)
        copy.criteria = goal.criteria.map(clean)
        return copy
    }

    /// Text with the student's full name (first or preferred, then last) replaced by `shown`, then the
    /// last name and the long parts of a compound one replaced by `shown`, and the student ids replaced by "[ID]". Whole words only, any capitalization, so
    /// a possessive such as "Rivera's" still matches.
    static func scrubbed(_ text: String, of student: Student, shownAs shown: String) -> String {
        var result = text
        var names = ["\(student.firstName) \(student.lastName)", student.lastName]
        if let preferred = student.preferredName, !preferred.isEmpty {
            names.append("\(preferred) \(student.lastName)")
        }
        // Parts of a compound surname ("Smith-Jones", "Van Der Berg"), ignoring short particles.
        let parts = student.lastName.split(whereSeparator: { $0 == " " || $0 == "-" }).map(String.init)
        if parts.count > 1 { names.append(contentsOf: parts.filter { $0.count >= 4 }) }
        let ids = [student.localStudentID, student.stateStudentID].compactMap { $0 }
        let targets = (names.map { ($0, shown) } + ids.map { ($0, "[ID]") })
            .sorted { $0.0.count > $1.0.count }
        for (target, replacement) in targets {
            let word = target.trimmingCharacters(in: .whitespaces)
            guard !word.isEmpty else { continue }
            let pattern = "\\b" + NSRegularExpression.escapedPattern(for: word) + "\\b"
            result = result.replacingOccurrences(
                of: pattern, with: NSRegularExpression.escapedTemplate(for: replacement),
                options: [.regularExpression, .caseInsensitive])
        }
        return result
    }
}
