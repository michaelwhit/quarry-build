import Foundation
import Observation

public enum EvaluationKind: String, CaseIterable, Identifiable, Sendable {
    case psychological, speechLanguage, occupationalTherapy, physicalTherapy, teamReport, screener, other
    public var id: String { rawValue }
    public var label: String {
        switch self {
        case .psychological: "Psychological"
        case .speechLanguage: "Speech-language"
        case .occupationalTherapy: "Occupational therapy"
        case .physicalTherapy: "Physical therapy"
        case .teamReport: "Team report"
        case .screener: "Screener or progress data"
        case .other: "Other"
        }
    }
}

public enum ScoreType: String, CaseIterable, Identifiable, Sendable {
    case standard, scaled, tScore, percentile, zScore, raw, cbm, ageEquivalent, gradeEquivalent
    public var id: String { rawValue }
    public var label: String {
        switch self {
        case .standard: "Standard score"
        case .scaled: "Scaled score"
        case .tScore: "T-score"
        case .percentile: "Percentile"
        case .zScore: "z-score"
        case .raw: "Raw score"
        case .cbm: "Curriculum-based measure"
        case .ageEquivalent: "Age equivalent"
        case .gradeEquivalent: "Grade equivalent"
        }
    }
}

/// One reported score, typed by the teacher exactly as printed.
public struct ScoreRow: Identifiable, Equatable, Sendable {
    public var id = UUID()
    public var measure = ""
    public var scoreType: ScoreType = .standard
    /// As typed. Kept as text so a half-typed number is not lost.
    public var value = ""
    public var percentile = ""

    public init() {}

    public var numericValue: Double? {
        Double(value.trimmingCharacters(in: .whitespaces))
    }

    public var isBlank: Bool {
        measure.trimmingCharacters(in: .whitespaces).isEmpty
            && value.trimmingCharacters(in: .whitespaces).isEmpty
            && percentile.trimmingCharacters(in: .whitespaces).isEmpty
    }

    /// What is wrong with the row, if anything.
    public var problems: [String] {
        guard !isBlank else { return [] }
        var found: [String] = []
        if measure.trimmingCharacters(in: .whitespaces).isEmpty { found.append("Name the measure.") }
        if value.trimmingCharacters(in: .whitespaces).isEmpty {
            found.append("Enter the score.")
        } else if numericValue == nil {
            found.append("The score must be a number.")
        }
        let p = percentile.trimmingCharacters(in: .whitespaces)
        if !p.isEmpty {
            if let n = Int(p), (1...99).contains(n) {} else { found.append("Percentile is a whole number from 1 to 99.") }
        }
        return found
    }
}

/// One piece of text exactly as it would be sent, after redaction.
public struct PreviewItem: Identifiable, Equatable, Sendable {
    public var id: String
    public var label: String
    public var text: String
    public var replaced: [String: Int]
    public var withheldReasons: [String]
    public var isWithheld: Bool { !withheldReasons.isEmpty }
}

/// The evaluation material a teacher is entering for one student. It lives in memory only:
/// nothing is saved to disk and nothing is sent. Confirming marks this exact content as checked;
/// changing anything afterwards makes the confirmation stale.
@MainActor
@Observable
public final class EvidenceIntake {
    public var kind: EvaluationKind = .teamReport
    public var instrument = ""
    public var rows: [ScoreRow] = [ScoreRow()]
    public var summary = ""
    public var recommendations = ""
    /// Names that must never appear: the student, staff, examiners, schools.
    public var names: [String]
    private var confirmedFingerprint: String?

    public init(names: [String] = []) {
        self.names = names
    }

    // MARK: Editing

    public func addRow() { rows.append(ScoreRow()) }

    public func removeRows(at offsets: IndexSet) {
        for index in offsets.sorted(by: >) where rows.indices.contains(index) { rows.remove(at: index) }
        if rows.isEmpty { rows = [ScoreRow()] }
    }

    // MARK: Preview

    private var filledRows: [ScoreRow] { rows.filter { !$0.isBlank } }

    /// Everything that would be sent, redacted, in order. Pasted text is split line by line.
    public var preview: [PreviewItem] {
        var items: [PreviewItem] = []
        func add(_ id: String, _ label: String, _ source: String) {
            let result = EvidenceRedactor.redact(source, names: names)
            items.append(
                PreviewItem(
                    id: id, label: label, text: result.text, replaced: result.replaced,
                    withheldReasons: result.withheldReasons))
        }
        for (index, row) in filledRows.enumerated() {
            var line = "\(row.measure.trimmingCharacters(in: .whitespaces))"
            let instrument = instrument.trimmingCharacters(in: .whitespaces)
            if !instrument.isEmpty { line += " (\(instrument))" }
            line += ": \(row.scoreType.label.lowercased()) \(row.value.trimmingCharacters(in: .whitespaces))"
            let p = row.percentile.trimmingCharacters(in: .whitespaces)
            if !p.isEmpty { line += ", percentile \(p)" }
            add("score-\(index)", "Score \(index + 1)", line)
        }
        for (index, line) in EvidenceRedactor.paragraphs(summary).enumerated() {
            add("summary-\(index)", "Summary \(index + 1)", line)
        }
        for (index, line) in EvidenceRedactor.paragraphs(recommendations).enumerated() {
            add("recommendation-\(index)", "Recommendation \(index + 1)", line)
        }
        return items
    }

    public var rowProblems: [String] { filledRows.flatMap(\.problems) }

    public var hasContent: Bool { !preview.isEmpty }

    public var withheldCount: Int { preview.filter(\.isWithheld).count }

    /// Why the teacher cannot confirm yet, in plain words. Empty means ready.
    public var blockers: [String] {
        var found: [String] = []
        if !hasContent { found.append("Add at least one score or some text.") }
        found.append(contentsOf: rowProblems)
        if withheldCount > 0 {
            found.append("\(withheldCount) line\(withheldCount == 1 ? "" : "s") held back. Reword or remove them.")
        }
        return found
    }

    // MARK: Confirmation

    /// A short description of exactly what the preview holds. If it changes, the check is stale.
    private var fingerprint: String {
        preview.map { "\($0.id)|\($0.text)|\($0.isWithheld)" }.joined(separator: "\n")
    }

    public var isConfirmed: Bool { confirmedFingerprint != nil && confirmedFingerprint == fingerprint }

    @discardableResult
    public func confirm() -> Bool {
        guard blockers.isEmpty else { return false }
        confirmedFingerprint = fingerprint
        return true
    }

    /// The checked text, only while the confirmation still matches what is on screen.
    public var confirmedItems: [PreviewItem]? { isConfirmed ? preview : nil }

    public func clear() {
        rows = [ScoreRow()]
        summary = ""
        recommendations = ""
        instrument = ""
        confirmedFingerprint = nil
    }
}
