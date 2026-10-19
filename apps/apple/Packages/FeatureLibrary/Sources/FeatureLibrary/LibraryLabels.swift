import Foundation

/// Plain-words labels for the machine values in the bundle. Unknown values fall back to a readable
/// form of the raw value, so new content never shows an underscore.
public enum LibraryLabels {
    public static func discipline(_ raw: String) -> String {
        switch raw {
        case "sped_teacher": "Special education teacher"
        case "slp": "Speech-language"
        case "ot": "Occupational therapy"
        case "pt": "Physical therapy"
        case "psych": "School psychologist"
        case "counselor": "Counselor"
        case "any": "Any team member"
        default: readable(raw)
        }
    }

    public static func method(_ raw: String) -> String {
        switch raw {
        case "trials": "Trials (correct out of tries)"
        case "yes_no": "Yes or no each time"
        case "frequency": "Count of times"
        case "duration": "How long"
        case "latency": "How long to start"
        case "interval": "Interval check"
        case "prompt_level": "Level of prompting"
        case "cbm_probe": "Short timed probe"
        case "rubric": "Rubric"
        case "gas": "Goal attainment scale"
        case "task_analysis": "Steps checklist"
        case "percent_correct": "Percent correct"
        case "anecdotal": "Notes"
        default: readable(raw)
        }
    }

    public static func tag(_ raw: String) -> String { readable(raw) }

    static func readable(_ raw: String) -> String {
        let spaced = raw.replacingOccurrences(of: "_", with: " ")
        return spaced.prefix(1).uppercased() + spaced.dropFirst()
    }
}
