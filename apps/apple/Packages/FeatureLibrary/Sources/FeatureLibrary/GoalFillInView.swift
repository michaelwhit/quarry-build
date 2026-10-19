import DesignSystem
import StarterLibrary
import SwiftUI

/// The fill-in form: one field per blank, the finished goal updating as the teacher types,
/// and the measurability checklist beside it. Adding the goal to a student's plan is "Planned"
/// until the goal fields it writes exist.
struct GoalFillInView: View {
    @State private var draft: GoalDraft
    let today: Date
    let onBack: () -> Void

    init(goal: GoalTemplate, studentName: String? = nil, today: Date = Date(), onBack: @escaping () -> Void) {
        self._draft = State(initialValue: GoalDraft(template: goal, studentName: studentName))
        self.today = today
        self.onBack = onBack
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.medium) {
                Button(action: onBack) {
                    Label("Back to \(draft.template.title)", systemImage: "chevron.left")
                        .frame(minHeight: Spacing.minTapTarget, alignment: .leading)
                }
                .accessibilityIdentifier("fillin.back")

                livePreview
                fields
                checklist

                HStack {
                    StatusChip("Planned", systemImage: "clock", tone: .neutral)
                    Text("Adding this goal to a student's plan is not built yet.")
                        .font(.callout).foregroundStyle(Theme.muted)
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("fillin.attachPlanned")
            }
            .padding(Spacing.medium)
        }
        .themedScreen()
    }

    private var livePreview: some View {
        VStack(alignment: .leading, spacing: Spacing.small) {
            Text("Your goal").font(.headline).foregroundStyle(Theme.ink).accessibilityAddTraits(.isHeader)
            draft.pieces().reduce(Text("")) { acc, piece in
                switch piece {
                case .text(let t): acc + Text(t).foregroundStyle(Theme.ink)
                case .filled(_, let v): acc + Text(v).bold().foregroundStyle(Theme.accent)
                case .empty(let s): acc + Text("[\(GoalTemplateText.label(for: s))]").foregroundStyle(Theme.warn)
                }
            }
            .accessibilityIdentifier("fillin.preview")
            .accessibilityLabel(draft.renderedText())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }

    private var fields: some View {
        VStack(alignment: .leading, spacing: Spacing.medium) {
            Text("Fill in the blanks").font(.headline).foregroundStyle(Theme.ink).accessibilityAddTraits(.isHeader)
            ForEach(draft.formSlots, id: \.name) { slot in
                field(slot)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }

    @ViewBuilder
    private func field(_ slot: FormSlot) -> some View {
        let label = GoalTemplateText.label(for: slot.name).capitalizedFirst
        VStack(alignment: .leading, spacing: 4) {
            switch slot.kind {
            case "choice":
                Picker(label, selection: binding(slot.name)) {
                    if (draft.values[slot.name] ?? "").isEmpty { Text("Choose one").tag("") }
                    ForEach(slot.choices, id: \.self) { Text($0).tag($0) }
                }
                .accessibilityIdentifier("fillin.field.\(slot.name)")
            case "date":
                if draft.dates[slot.name] == nil {
                    Button("Choose \(label.lowercased())") { draft.dates[slot.name] = today }
                        .frame(minHeight: Spacing.minTapTarget, alignment: .leading)
                        .accessibilityIdentifier("fillin.field.\(slot.name)")
                } else {
                    DatePicker(label, selection: dateBinding(slot.name), displayedComponents: .date)
                        .frame(minHeight: Spacing.minTapTarget)
                        .accessibilityIdentifier("fillin.field.\(slot.name)")
                }
            default:
                Text(label).font(.caption).foregroundStyle(Theme.muted)
                TextField(label, text: binding(slot.name))
                    .textFieldStyle(.roundedBorder)
                    .frame(minHeight: Spacing.minTapTarget)
                    #if os(iOS)
                        .keyboardType(slot.kind == "number" ? .decimalPad : .default)
                    #endif
                    .accessibilityIdentifier("fillin.field.\(slot.name)")
            }
            if let help = slot.help {
                Text(help).font(.footnote).foregroundStyle(Theme.muted)
            }
        }
    }

    private var checklist: some View {
        let checks = draft.checks(today: today)
        return VStack(alignment: .leading, spacing: Spacing.small) {
            Text("Is it measurable?").font(.headline).foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            ForEach(checks) { check in
                HStack(alignment: .top, spacing: Spacing.small) {
                    Image(systemName: check.status == .pass ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                        .foregroundStyle(check.status == .pass ? Theme.good : Theme.warn)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(check.label).foregroundStyle(Theme.ink)
                        if check.status == .fail, let fix = check.fix {
                            Text(fix).font(.footnote).foregroundStyle(Theme.muted)
                        }
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityValue(check.status == .pass ? "done" : "needs attention")
                .accessibilityIdentifier("fillin.check.\(check.id)")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }

    private func binding(_ name: String) -> Binding<String> {
        Binding(get: { draft.values[name] ?? "" }, set: { draft.values[name] = $0 })
    }

    private func dateBinding(_ name: String) -> Binding<Date> {
        Binding(get: { draft.dates[name] ?? today }, set: { draft.dates[name] = $0 })
    }
}

extension String {
    fileprivate var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}
