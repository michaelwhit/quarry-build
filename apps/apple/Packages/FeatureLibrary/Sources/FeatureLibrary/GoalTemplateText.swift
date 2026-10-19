import Foundation

/// A goal template's wording split into plain text and the pieces a teacher fills in.
/// Template syntax (content/starter): `{name}` is a slot, `{student}` and `{date}` are the usual
/// ones, and `{95}` is a number the template suggests, shown as is.
public enum TemplateSegment: Equatable, Sendable {
    case text(String)
    case slot(String)
    case number(String)
}

public enum GoalTemplateText {
    public static func segments(_ template: String) -> [TemplateSegment] {
        var out: [TemplateSegment] = []
        var buffer = ""
        var index = template.startIndex
        while index < template.endIndex {
            let ch = template[index]
            if ch == "{", let close = template[index...].firstIndex(of: "}") {
                let name = String(template[template.index(after: index)..<close])
                if !name.isEmpty, !name.contains("{") {
                    if !buffer.isEmpty { out.append(.text(buffer)); buffer = "" }
                    out.append(Double(name) != nil ? .number(name) : .slot(name))
                    index = template.index(after: close)
                    continue
                }
            }
            buffer.append(ch)
            index = template.index(after: index)
        }
        if !buffer.isEmpty { out.append(.text(buffer)) }
        return out
    }

    /// The template as one line for browsing, with each slot shown as a bracketed word,
    /// "[word type]". `studentLabel` stands in for the student's name; templates never hold one.
    public static func preview(_ template: String, studentLabel: String = "the student") -> String {
        segments(template).map { segment in
            switch segment {
            case .text(let t): t
            case .number(let n): n
            case .slot(let name):
                name == "student" ? studentLabel : "[\(label(for: name))]"
            }
        }.joined()
    }

    /// "word_type" reads as "word type".
    public static func label(for slotName: String) -> String {
        slotName.replacingOccurrences(of: "_", with: " ")
    }

    /// Names of the slots in the wording, in order, without repeats. Excludes `student`.
    public static func slotNames(_ template: String) -> [String] {
        var seen: Set<String> = []
        return segments(template).compactMap { segment in
            if case .slot(let n) = segment, n != "student", seen.insert(n).inserted { return n }
            return nil
        }
    }
}
