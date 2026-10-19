import CoreModels
import DesignSystem
import Persistence
import SwiftUI

#if os(macOS)
    import AppKit
#else
    import UIKit
#endif

/// The "AI draft, teacher approves" step for one goal's SRS progress entry.
///
/// Flow: the teacher asks for a draft (a mock sample for now), reads the data it cites, edits the
/// Sufficient answer and comment, and only an explicit Approve stores anything. Rejecting throws
/// the draft away. Nothing is saved from the AI side alone.
public struct ProgressDraftView: View {
    @Environment(PrototypeStore.self) private var store

    private let goal: Goal
    private let student: Student

    @State private var draft: ProgressDraft?
    @State private var sufficient = true
    @State private var comment = ""
    @State private var isDrafting = false
    @State private var errorMessage: String?
    @State private var copied = false

    public init(goal: Goal, student: Student) {
        self.goal = goal
        self.student = student
    }

    private var studentName: String { student.preferredName ?? student.firstName }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let approval = store.approval(for: goal) {
                approvedBody(approval)
            } else if let draft {
                draftBody(draft)
            } else {
                startBody
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(Theme.bad).font(.callout)
            }
        }
    }

    // MARK: States

    private var startBody: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(
                "Drafts a progress comment from the data. This is a sample from a mock provider; nothing leaves this device and nothing is saved until you approve it."
            )
            .font(.callout)
            .foregroundStyle(.secondary)
            Button {
                Task { await makeDraft() }
            } label: {
                if isDrafting {
                    ProgressView()
                } else {
                    Label("Draft progress comment", systemImage: "sparkles")
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(isDrafting)
            .accessibilityIdentifier(AccessibilityID.draftComment)
        }
    }

    private func draftBody(_ draft: ProgressDraft) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                StatusChip("Sample AI draft", systemImage: "sparkles", tone: .caution)
                StatusChip("Not saved", tone: .neutral)
            }
            Picker("Sufficient progress?", selection: $sufficient) {
                Text("Yes").tag(true)
                Text("No").tag(false)
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier(AccessibilityID.draftSufficient)
            TextEditor(text: $comment)
                .frame(minHeight: 140)
                .font(.body)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(.quaternary))
                .accessibilityLabel("Progress comment")
                .accessibilityIdentifier(AccessibilityID.draftText)
            DisclosureGroup("Where this came from") {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(draft.citations, id: \.self) { Text("• \($0)").font(.callout) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack {
                Button("Approve") { approve(draft) }
                    .buttonStyle(.borderedProminent)
                    .disabled(comment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier(AccessibilityID.draftApprove)
                Button("Reject draft", role: .destructive) { self.draft = nil }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier(AccessibilityID.draftReject)
            }
            Text("You are responsible for what you approve. Check it against the data.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private func approvedBody(_ approval: ProgressApproval) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                StatusChip("Approved", systemImage: "checkmark.seal", tone: .good)
                StatusChip(
                    approval.sufficient ? "Sufficient: Yes" : "Sufficient: No",
                    tone: approval.sufficient ? .good : .caution)
                if approval.wasEdited { StatusChip("Edited by teacher", tone: .neutral) }
            }
            Text(approval.comment)
                .textSelection(.enabled)
            Text(
                "Approved by \(store.staffName(approval.approvedBy)) on \(approval.approvedAt.formatted(date: .abbreviated, time: .shortened))"
            )
            .font(.footnote)
            .foregroundStyle(.secondary)
            HStack {
                Button {
                    copyForSRS(approval)
                } label: {
                    Label(copied ? "Copied" : "Copy for SRS", systemImage: "doc.on.doc")
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier(AccessibilityID.copyForSRS)
                Button("Undo approval", role: .destructive) {
                    store.removeApproval(for: goal)
                    draft = nil
                    copied = false
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier(AccessibilityID.undoApproval)
            }
            Text(
                "SRS stays the official record. Paste this into the goal's progress entry in SRS yourself."
            )
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
    }

    // MARK: Actions

    private func makeDraft() async {
        errorMessage = nil
        guard let progress = store.progress(for: goal) else {
            errorMessage = "This goal has no measurement plan yet."
            return
        }
        isDrafting = true
        // A short pause so the demo feels like a model call; the work itself is instant.
        try? await Task.sleep(for: .milliseconds(600))
        isDrafting = false
        guard let result = MockProgressDrafter.draft(for: goal, progress: progress) else {
            errorMessage = "Not enough data yet. Record at least three sessions first."
            return
        }
        draft = result
        sufficient = result.sufficient
        comment = result.reidentified(as: studentName)
    }

    private func approve(_ draft: ProgressDraft) {
        do {
            try store.approve(
                goal: goal, sufficient: sufficient,
                comment: comment.trimmingCharacters(in: .whitespacesAndNewlines),
                aiSuggestedSufficient: draft.sufficient,
                aiSuggestedComment: draft.reidentified(as: studentName),
                provider: draft.provider)
            self.draft = nil
        } catch {
            errorMessage = "Could not save the approval."
        }
    }

    private func copyForSRS(_ approval: ProgressApproval) {
        let text =
            "Sufficient: \(approval.sufficient ? "Yes" : "No")\nComment: \(approval.comment)"
        #if os(macOS)
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(text, forType: .string)
        #else
            UIPasteboard.general.setItems(
                [[UIPasteboard.typeAutomatic: text]],
                options: [.expirationDate: Date().addingTimeInterval(60), .localOnly: true])
        #endif
        copied = true
    }
}
