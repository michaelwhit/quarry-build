import Foundation

/// Removes identifying details from evaluation text before anyone could send it anywhere.
/// It works on one paragraph at a time. A paragraph that still looks identifying after
/// redaction, or that states an eligibility conclusion, is withheld and shown to the teacher.
public enum EvidenceRedactor {
    public struct Result: Equatable, Sendable {
        public var text: String
        /// How many details were replaced, by kind, for the preview ("2 names, 1 date").
        public var replaced: [String: Int]
        /// Why the paragraph is withheld. Empty means it can be sent.
        public var withheldReasons: [String]
        public var isWithheld: Bool { !withheldReasons.isEmpty }
    }

    /// Words that mark a paragraph as one the teacher should reword or remove.
    static let withheldPhrases: [(phrase: String, reason: String)] = [
        ("date of birth", "birth date"), ("dob", "birth date"), ("home address", "home address"), ("street address", "home address"),
        ("mailing address", "home address"),
        ("social security", "identification number"), ("medicaid", "insurance details"),
        ("disability category", "disability category"), ("primary disability", "disability category"),
        ("eligible", "eligibility conclusion"), ("eligibility", "eligibility conclusion"),
    ]

    private static let patterns: [(label: String, token: String, pattern: String)] = [
        ("emails", "[email]", "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"),
        ("ids", "[id]", "\\b\\d{3}-\\d{2}-\\d{4}\\b"),
        ("phones", "[phone]", "\\(?\\b\\d{3}\\)?[-. ]\\d{3}[-. ]\\d{4}\\b"),
        ("dates", "[date]", "\\b\\d{1,2}/\\d{1,2}/\\d{2,4}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b"),
        (
            "dates", "[date]",
            "\\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.? (?:\\d{1,2}, )?\\d{4}\\b"
        ),
        ("numbers", "[number]", "\\b\\d{7,}\\b"),
    ]

    /// `names` are every name that must not appear: students, staff, the examiner, the school.
    public static func redact(_ paragraph: String, names: [String]) -> Result {
        var text = paragraph
        var replaced: [String: Int] = [:]

        for name in Set(names.map { $0.trimmingCharacters(in: .whitespaces) })
            .filter({ $0.count >= 2 }).sorted(by: { $0.count > $1.count })
        {
            let pattern = "\\b" + NSRegularExpression.escapedPattern(for: name) + "\\b"
            let count = replace(&text, pattern: pattern, with: "[name]", caseInsensitive: true)
            if count > 0 { replaced["names", default: 0] += count }
        }
        for item in patterns {
            let count = replace(&text, pattern: item.pattern, with: item.token, caseInsensitive: false)
            if count > 0 { replaced[item.label, default: 0] += count }
        }

        let lowered = text.lowercased()
        var reasons: [String] = []
        for (phrase, reason) in withheldPhrases
        where containsWord(lowered, phrase) && !reasons.contains(reason) {
            reasons.append(reason)
        }
        return Result(text: text, replaced: replaced, withheldReasons: reasons)
    }

    /// Splits pasted text into paragraphs: blank lines separate them, and each non-empty line
    /// of a table is kept on its own so one bad row does not hold back the rest.
    public static func paragraphs(_ text: String) -> [String] {
        text.split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }

    private static func containsWord(_ text: String, _ word: String) -> Bool {
        text.range(of: "\\b" + NSRegularExpression.escapedPattern(for: word) + "\\b", options: .regularExpression)
            != nil
    }

    private static func replace(
        _ text: inout String, pattern: String, with token: String, caseInsensitive: Bool
    ) -> Int {
        guard
            let regex = try? NSRegularExpression(
                pattern: pattern, options: caseInsensitive ? [.caseInsensitive] : [])
        else { return 0 }
        let range = NSRange(text.startIndex..., in: text)
        let count = regex.numberOfMatches(in: text, range: range)
        guard count > 0 else { return 0 }
        text = regex.stringByReplacingMatches(
            in: text, range: range, withTemplate: NSRegularExpression.escapedTemplate(for: token))
        return count
    }
}
