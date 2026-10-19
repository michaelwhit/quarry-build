import Foundation
import StarterLibrary

/// Plain-words sentences built from library data. Kept out of the views so they are not tied to the
/// main actor and tests can call them directly.
public enum LibraryText {
    public static func masteryLine(_ m: Mastery) -> String {
        let target: String
        if let t = m.threshold {
            let unit = m.unit == "percent" ? "%" : (m.unit.map { " " + $0 } ?? "")
            target = "\(t.formatted())\(unit)"
        } else if let slot = m.thresholdFromSlot {
            target = "the [\(GoalTemplateText.label(for: slot))] you choose"
        } else {
            target = "the target"
        }
        let words: String
        switch m.windowKind {
        case "consecutive": words = "\(m.windowCount) times in a row"
        case "best_of": words = "\(m.windowCount) of the last \(m.windowOf) checks"
        default: words = "\(m.windowCount) of \(m.windowOf) checks"
        }
        let comparator = m.comparator == ">=" ? "at or above" : (m.comparator == "<=" ? "at or below" : m.comparator)
        return "\(comparator.prefix(1).uppercased() + comparator.dropFirst()) \(target), \(words)"
            + (m.maintenanceCheck ? ", then a later check that it lasts" : "")
    }

    public static func provenanceLine(_ p: Provenance) -> String {
        var line = p.origin == "original" ? "Written for Demo App" : LibraryLabels.tag(p.origin)
        if let reviewer = p.reviewer {
            line += "; reviewed by \(reviewer)" + (p.reviewedOn.map { " on \($0)" } ?? "")
        } else {
            line += "; not yet reviewed by a specialist"
        }
        return line
    }
}
