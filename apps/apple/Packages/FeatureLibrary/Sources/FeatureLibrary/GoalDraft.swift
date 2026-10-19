import Foundation
import StarterLibrary

/// One piece of the goal as the teacher is filling it in.
public enum RenderedPiece: Equatable, Sendable {
    case text(String)
    /// A slot with a value. The student slot holds the student's name or the neutral stand-in.
    case filled(slot: String, value: String)
    case empty(slot: String)
}

/// A blank on the form. Built from the template's declared slot, or inferred when the wording
/// names a slot the template did not declare.
public struct FormSlot: Equatable, Sendable {
    public var name: String
    public var kind: String
    public var choices: [String]
    public var help: String?
}

public struct MeasurabilityCheck: Equatable, Sendable, Identifiable {
    public enum Status: Equatable, Sendable { case pass, fail }
    public var id: String
    public var label: String
    public var status: Status
    /// What to do, in plain words, when the check fails.
    public var fix: String?
}

/// A library goal being filled in. Pure value logic: the form edits `values` and `dates`,
/// the preview and the checks are recomputed from them, so they can never disagree. No student data
/// is stored here; `studentName` is only what the screen shows.
public struct GoalDraft: Sendable, Equatable {
    public let template: GoalTemplate
    public var values: [String: String]
    public var dates: [String: Date]
    public var studentName: String?

    public init(template: GoalTemplate, studentName: String? = nil) {
        self.template = template
        self.studentName = studentName
        var initial: [String: String] = [:]
        for slot in template.slots {
            if let value = slot.default { initial[slot.name] = value }
            else if slot.kind == "choice", slot.choices?.count == 1, let only = slot.choices?.first {
                initial[slot.name] = only
            }
        }
        values = initial
        dates = [:]
    }

    /// Slots the form shows: every slot named in the wording except the student, in wording order,
    /// then any declared slot the wording does not use (so none is lost).
    public var formSlots: [FormSlot] {
        let declared = Dictionary(template.slots.map { ($0.name, $0) }, uniquingKeysWith: { a, _ in a })
        var out: [FormSlot] = []
        var seen: Set<String> = []
        for name in GoalTemplateText.slotNames(template.templateText) where seen.insert(name).inserted {
            // A slot named in the wording but not declared is a date if it is called date, else text.
            if let slot = declared[name] {
                out.append(FormSlot(name: name, kind: slot.kind, choices: slot.choices ?? [], help: slot.help))
            } else {
                out.append(FormSlot(name: name, kind: name == "date" ? "date" : "text", choices: [], help: nil))
            }
        }
        return out
    }

    public func value(_ slot: String) -> String { values[slot]?.trimmingCharacters(in: .whitespaces) ?? "" }

    public func isFilled(_ slot: FormSlot) -> Bool {
        slot.kind == "date" ? dates[slot.name] != nil : !value(slot.name).isEmpty
    }

    public func pieces() -> [RenderedPiece] {
        let kinds = Dictionary(formSlots.map { ($0.name, $0) }, uniquingKeysWith: { a, _ in a })
        return GoalTemplateText.segments(template.templateText).map { segment -> RenderedPiece in
            switch segment {
            case .text(let t): return .text(t)
            case .number(let n): return .text(n)
            case .slot(let name):
                if name == "student" {
                    return .filled(slot: name, value: studentName ?? "the student")
                }
                guard let slot = kinds[name], isFilled(slot) else { return .empty(slot: name) }
                if slot.kind == "date", let d = dates[name] {
                    return .filled(slot: name, value: d.formatted(.dateTime.month(.wide).day().year()))
                }
                return .filled(slot: name, value: value(name))
            }
        }
    }

    /// The finished wording; empty slots show as "[word type]".
    public func renderedText() -> String {
        pieces().map { piece in
            switch piece {
            case .text(let t): t
            case .filled(_, let v): v
            case .empty(let s): "[\(GoalTemplateText.label(for: s))]"
            }
        }.joined()
    }

    // MARK: Measurability checks

    static let vagueVerbs = ["understand", "improve", "be aware of", "appreciate", "know", "learn about", "enjoy"]

    /// Frequencies the rule decisions forbid in free text ("as needed" and its relatives).
    static let vagueFrequencies = ["as needed", "as appropriate", "when needed", "if needed", "as necessary", "when appropriate"]

    /// `today` is passed in so tests do not depend on the clock.
    public func checks(today: Date) -> [MeasurabilityCheck] {
        var out: [MeasurabilityCheck] = []
        let slots = formSlots

        let missing = slots.filter { !isFilled($0) }
        out.append(
            MeasurabilityCheck(
                id: "slots", label: "Every blank is filled in",
                status: missing.isEmpty ? .pass : .fail,
                fix: missing.isEmpty
                    ? nil : "Fill in: " + missing.map { GoalTemplateText.label(for: $0.name) }.joined(separator: ", ")))

        out.append(
            MeasurabilityCheck(
                id: "condition", label: "Says when or with what help the student does it",
                status: template.conditionText.trimmingCharacters(in: .whitespaces).isEmpty ? .fail : .pass,
                fix: "Add a condition such as \"Given a list of words\"."))

        let behavior = Self.normalized(template.behaviorText)
        let vague = Self.vagueVerbs.first { behavior == $0 || behavior.hasPrefix($0 + " ") }
        out.append(
            MeasurabilityCheck(
                id: "observable", label: "Describes something you can see or hear",
                status: behavior.isEmpty || vague != nil ? .fail : .pass,
                fix: vague.map { "\"\($0)\" cannot be observed. Use a verb like read, write, say or point to." }
                    ?? "Say what the student will do."))

        out.append(criterionCheck())

        let method = template.measurementPlanTemplate.method
        out.append(
            MeasurabilityCheck(
                id: "method", label: "Has a way to measure it",
                status: method.isEmpty ? .fail : .pass, fix: "Choose how data will be taken."))

        let dateSlots = slots.filter { $0.kind == "date" }
        let dated = dateSlots.contains { dates[$0.name] != nil }
        let pastDate = dateSlots.contains { slot in dates[slot.name].map { $0 < Calendar.current.startOfDay(for: today) } ?? false }
        out.append(
            MeasurabilityCheck(
                id: "date", label: "Has a date to be met by",
                status: dated && !pastDate ? .pass : .fail,
                fix: pastDate ? "That date has already passed." : "Pick the date the goal should be met by."))

        let freeText = slots.filter { $0.kind == "text" }.map { Self.normalized(value($0.name)) }
        let vagueText = freeText.contains { text in Self.vagueFrequencies.contains { text.contains($0) } }
        if vagueText {
            out.append(
                MeasurabilityCheck(
                    id: "frequency", label: "Says how often, with a number",
                    status: .fail, fix: "\"As needed\" is not allowed. Say how many times and how often."))
        }
        return out
    }

    private func criterionCheck() -> MeasurabilityCheck {
        let m = template.mastery
        var problem: String?
        if let slotName = m.thresholdFromSlot {
            let typed = value(slotName)
            if typed.isEmpty { problem = "Fill in the \(GoalTemplateText.label(for: slotName)) target." }
            else if let n = Double(typed), n > 0 {} else { problem = "The \(GoalTemplateText.label(for: slotName)) target must be a plain number above zero, without % or units." }
        } else if m.threshold == nil {
            problem = "Add how well the student must do it."
        }
        if m.windowCount < 1 || m.windowOf < m.windowCount {
            problem = problem ?? "Say how many times, for example 3 of 4 checks."
        }
        return MeasurabilityCheck(
            id: "criterion", label: "Says how well and how often",
            status: problem == nil ? .pass : .fail, fix: problem)
    }

    static func normalized(_ s: String) -> String {
        s.lowercased().split(whereSeparator: { !$0.isLetter && !$0.isNumber }).joined(separator: " ")
    }

    /// True when every check passes.
    public func isReady(today: Date) -> Bool { checks(today: today).allSatisfy { $0.status == .pass } }
}
