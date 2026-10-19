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

    /// Every name that must not appear, compiled once. Build one per set of names and reuse it.
    public struct NameMatcher: @unchecked Sendable {
        fileprivate let regex: NSRegularExpression?

        /// Names are matched as whole words, ignoring case, longest first so "Maria Lopez"
        /// goes before "Maria". One-letter entries are ignored.
        public init(names: [String]) {
            let cleaned = Set(names.map { $0.trimmingCharacters(in: .whitespaces) })
                .filter { $0.count >= 2 }
                .sorted { $0.count != $1.count ? $0.count > $1.count : $0 < $1 }
            guard !cleaned.isEmpty else {
                regex = nil
                return
            }
            let alternatives = cleaned.map { NSRegularExpression.escapedPattern(for: $0) }
            regex = try? NSRegularExpression(
                pattern: "\\b(?:" + alternatives.joined(separator: "|") + ")\\b",
                options: [.caseInsensitive])
        }
    }

    /// Words that mark a paragraph as one the teacher should reword or remove.
    private static let withheldPhrases: [(phrase: String, reason: String)] = [
        ("date of birth", "birth date"), ("dob", "birth date"), ("home address", "home address"),
        ("street address", "home address"), ("mailing address", "home address"),
        ("social security", "identification number"), ("medicaid", "insurance details"),
        ("disability category", "disability category"), ("primary disability", "disability category"),
        ("eligible", "eligibility conclusion"), ("eligibility", "eligibility conclusion"),
    ]

    private struct Pattern: @unchecked Sendable {
        let label: String
        let token: String
        let regex: NSRegularExpression?
        init(_ label: String, _ token: String, _ pattern: String) {
            self.label = label
            self.token = token
            regex = try? NSRegularExpression(pattern: pattern)
        }
    }

    private static let patterns: [Pattern] = [
        Pattern("emails", "[email]", "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"),
        Pattern("ids", "[id]", "\\b\\d{3}-\\d{2}-\\d{4}\\b"),
        Pattern("phones", "[phone]", "\\(?\\b\\d{3}\\)?[-. ]\\d{3}[-. ]\\d{4}\\b"),
        Pattern("dates", "[date]", "\\b\\d{1,2}/\\d{1,2}/\\d{2,4}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b"),
        Pattern(
            "dates", "[date]",
            "\\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.? (?:\\d{1,2}, )?\\d{4}\\b"
        ),
        Pattern("numbers", "[number]", "\\b\\d{7,}\\b"),
    ]

    private struct Phrase: @unchecked Sendable {
        let regex: NSRegularExpression?
        let reason: String
    }

    private static let phraseMatchers: [Phrase] = withheldPhrases.map {
        Phrase(
            regex: try? NSRegularExpression(
                pattern: "\\b" + NSRegularExpression.escapedPattern(for: $0.phrase) + "\\b",
                options: [.caseInsensitive]),
            reason: $0.reason)
    }

    /// `names` are every name that must not appear: students, staff, the examiner, the school.
    /// For many paragraphs, build a `NameMatcher` once and use the other overload.
    public static func redact(_ paragraph: String, names: [String]) -> Result {
        redact(paragraph, matcher: NameMatcher(names: names))
    }

    public static func redact(_ paragraph: String, matcher: NameMatcher) -> Result {
        var text = paragraph
        var replaced: [String: Int] = [:]

        if let regex = matcher.regex {
            let count = replace(&text, regex: regex, token: "[name]")
            if count > 0 { replaced["names", default: 0] += count }
        }
        for item in patterns {
            guard let regex = item.regex else { continue }
            let count = replace(&text, regex: regex, token: item.token)
            if count > 0 { replaced[item.label, default: 0] += count }
        }

        var reasons: [String] = []
        let range = NSRange(text.startIndex..., in: text)
        for phrase in phraseMatchers {
            guard let regex = phrase.regex, !reasons.contains(phrase.reason),
                regex.firstMatch(in: text, range: range) != nil
            else { continue }
            reasons.append(phrase.reason)
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

    private static func replace(_ text: inout String, regex: NSRegularExpression, token: String) -> Int {
        let range = NSRange(text.startIndex..., in: text)
        let count = regex.numberOfMatches(in: text, range: range)
        guard count > 0 else { return 0 }
        text = regex.stringByReplacingMatches(
            in: text, range: range, withTemplate: NSRegularExpression.escapedTemplate(for: token))
        return count
    }
}
