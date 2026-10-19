import CoreModels
import DesignSystem
import SwiftUI

/// The iPhone home tab: who to take data on today, pinned goals, and a privacy toggle. The job on
/// the phone is capture, so this leads with start buttons, not graphs (spec 10.3).
public struct TodayView: View {
    let cards: [TodayCard]
    let pinned: [SessionGoal]
    let pinnedIDs: Set<UUID>
    @Binding var hideNames: Bool
    let resumeAvailable: Bool
    let onStart: ([SessionGoal]) -> Void
    let onResume: () -> Void
    let onTogglePin: (UUID) -> Void

    public init(
        cards: [TodayCard], pinned: [SessionGoal], pinnedIDs: Set<UUID>,
        hideNames: Binding<Bool>, resumeAvailable: Bool,
        onStart: @escaping ([SessionGoal]) -> Void, onResume: @escaping () -> Void,
        onTogglePin: @escaping (UUID) -> Void
    ) {
        self.cards = cards
        self.pinned = pinned
        self.pinnedIDs = pinnedIDs
        self._hideNames = hideNames
        self.resumeAvailable = resumeAvailable
        self.onStart = onStart
        self.onResume = onResume
        self.onTogglePin = onTogglePin
    }

    public var body: some View {
        List {
            if resumeAvailable {
                Section {
                    Button(action: onResume) {
                        Label("Resume the session you were in", systemImage: "arrow.clockwise.circle.fill")
                            .font(.headline)
                            .frame(minHeight: SessionStyle.minTarget, alignment: .leading)
                    }
                    .accessibilityIdentifier("today.resume")
                }
            }
            if !pinned.isEmpty {
                Section("Pinned goals") {
                    Button {
                        onStart(pinned)
                    } label: {
                        Label("Start quick session (\(pinned.count) goals)", systemImage: "bolt.fill")
                            .font(.headline)
                            .frame(minHeight: SessionStyle.minTarget, alignment: .leading)
                    }
                    .accessibilityIdentifier("today.quick")
                }
            }
            Section("Students") {
                if cards.isEmpty {
                    Text("No students on your caseload yet.").foregroundStyle(SessionStyle.muted)
                }
                ForEach(cards) { card in
                    cardRow(card)
                }
            }
        }
        .themedList()
        .navigationTitle("Today")
        .toolbar {
            ToolbarItem {
                Toggle(isOn: $hideNames) {
                    Label("Hide names", systemImage: hideNames ? "eye.slash" : "eye")
                }
                .accessibilityIdentifier("today.privacy")
            }
        }
    }

    private func cardRow(_ card: TodayCard) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                onStart(card.runnableGoals)
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(PrivacyLabel.label(for: card.student, hidden: hideNames))
                            .font(.headline)
                        Text(detail(card))
                            .font(.footnote)
                            .foregroundStyle(SessionStyle.muted)
                    }
                    Spacer()
                    Image(systemName: "play.circle.fill").font(.title)
                }
                .frame(minHeight: SessionStyle.minTarget)
            }
            .disabled(card.runnableGoals.isEmpty)
            .accessibilityIdentifier("today.card")
            ForEach(card.goals) { item in
                HStack {
                    Text(PrivacyLabel.text(item.goal.statement, for: item.student, hidden: hideNames)).font(.caption)
                        .foregroundStyle(SessionStyle.muted)
                    Spacer()
                    Button {
                        onTogglePin(item.id)
                    } label: {
                        Image(systemName: pinnedIDs.contains(item.id) ? "pin.fill" : "pin")
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(pinnedIDs.contains(item.id) ? "Unpin goal" : "Pin goal")
                }
            }
        }
    }

    private func detail(_ card: TodayCard) -> String {
        var parts = ["\(card.goals.count) \(card.goals.count == 1 ? "goal" : "goals")"]
        parts.append(TodayPlanner.lastDataText(days: card.daysSinceData))
        if card.skippedCount > 0 { parts.append("\(card.skippedCount) on the goal screen") }
        return parts.joined(separator: " · ")
    }
}

/// Today tab plus the session it starts, and the resume-after-crash check. The app supplies the
/// goals and where finished data points go; this owns everything between.
public struct TodayTab: View {
    let goals: [SessionGoal]
    let context: CommitContext
    let store: any SessionDraftStoring
    let deliver: @MainActor ([DataPoint]) throws -> Void

    @State private var session: SessionModel?
    @State private var resumable: SessionDraft?
    @State private var hideNames = false
    @State private var resumeProblem: String?
    /// An ended session from an earlier launch that still could not be stored.
    @State private var undelivered: SessionModel?
    @AppStorage("today.pinnedGoalIDs") private var pinnedRaw = ""

    public init(
        goals: [SessionGoal], context: CommitContext, store: any SessionDraftStoring,
        deliver: @escaping @MainActor ([DataPoint]) throws -> Void
    ) {
        self.goals = goals
        self.context = context
        self.store = store
        self.deliver = deliver
    }

    private var pinnedIDs: Set<UUID> {
        Set(pinnedRaw.split(separator: ",").compactMap { UUID(uuidString: String($0)) })
    }

    public var body: some View {
        Group {
            if let session {
                SessionView(model: session, hideNames: $hideNames) {
                    self.session = nil
                }
            } else {
                NavigationStack {
                    TodayView(
                        cards: TodayPlanner.cards(goals: goals, now: Date()),
                        pinned: TodayPlanner.pinned(goals: goals, pinnedIDs: pinnedIDs),
                        pinnedIDs: pinnedIDs, hideNames: $hideNames,
                        resumeAvailable: resumable != nil,
                        onStart: start, onResume: resume, onTogglePin: togglePin)
                }
            }
        }
        .alert(
            "Session not reopened", isPresented: Binding(
                get: { resumeProblem != nil }, set: { if !$0 { resumeProblem = nil } })
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(resumeProblem ?? "")
        }
        .alert(
            "Last session not stored", isPresented: Binding(
                get: { undelivered != nil }, set: { if !$0 { undelivered = nil } })
        ) {
            if let model = undelivered {
                if model.deliveryIsPermanent {
                    Button("Set aside") {
                        model.setAside()
                        undelivered = nil
                    }
                } else {
                    Button("Try again") {
                        model.retryDelivery()
                        undelivered = model.deliveryFailed ? model : nil
                    }
                }
            }
            Button("Not now", role: .cancel) {}
        } message: {
            Text(
                undelivered?.deliveryIsPermanent == true
                    ? "It can't be stored. Your data is kept on this device; set it aside to start a new session."
                    : "Your data is kept on this device. Try again to store it.")
        }
        .task { checkForDraft() }
    }

    private func start(_ items: [SessionGoal]) {
        let runnable = items.filter(\.isSupported)
        guard !runnable.isEmpty else { return }
        let draft = SessionDraft.start(goals: runnable, at: Date())
        open(draft, goals: runnable)
    }

    private func open(_ draft: SessionDraft, goals items: [SessionGoal]) {
        session = SessionModel(
            draft: draft, goals: items, context: context, store: store,
            haptic: { Haptics.tick() }, deliver: deliver)
        resumable = nil
    }

    private func resume() {
        guard let draft = resumable else { return }
        let ids = Set(draft.entries.map(\.goalID))
        let items = goals.filter { ids.contains($0.id) }
        // Goals that vanished (data changed under the draft) leave the draft unopenable; keep it
        // on disk rather than lose the taps, and let a person decide.
        guard items.count == ids.count else {
            resumeProblem = "This session can't be reopened. Your taps are kept on this device."
            return
        }
        resumeProblem = nil
        open(draft, goals: items)
    }

    /// An ended draft means the app died between "ended" and "delivered": deliver again (the data
    /// points keep their ids). An open draft with data is offered for resume.
    private func checkForDraft() {
        guard session == nil, let draft = try? store.load() else { return }
        if draft.isEnded {
            let ids = Set(draft.entries.map(\.goalID))
            let model = SessionModel(
                draft: draft, goals: goals.filter { ids.contains($0.id) }, context: context,
                store: store, deliver: deliver)
            model.resumeDelivery()
            if model.deliveryFailed { undelivered = model }
        } else if draft.hasData {
            resumable = draft
        } else {
            try? store.clear()
        }
    }

    private func togglePin(_ id: UUID) {
        var ids = pinnedIDs
        if ids.contains(id) { ids.remove(id) } else { ids.insert(id) }
        pinnedRaw = ids.map(\.uuidString).sorted().joined(separator: ",")
    }
}
