import CoreModels
import DesignSystem
import FeatureAIAssist
import FeatureDataCollection
import FeatureSession
import Persistence
import SwiftUI

/// One goal: the graph, a Record data button, recent sessions, and the AI-draft-then-approve step.
struct GoalScreen: View {
    @Environment(PrototypeStore.self) private var store
    let student: Student
    let goal: Goal
    @State private var recording = false

    var body: some View {
        let plan = store.plan(for: goal)
        List {
            Section {
                Text(goal.statement)
                if let plan {
                    LabeledContent("Measured by", value: plan.type.title)
                    if let baseline = goal.baseline { LabeledContent("Baseline", value: baseline) }
                    if let target = goal.target { LabeledContent("Target", value: target) }
                }
            }
            if let progress = store.progress(for: goal) {
                Section("Progress") {
                    GoalChartView(progress: progress)
                    Statistics(progress: progress)
                }
            }
            if let plan {
                Section("Recent sessions") {
                    RecentDataList(goal: goal, plan: plan)
                    NavigationLink("All sessions") {
                        SessionHistoryView(goal: goal, plan: plan)
                    }
                }
            }
            if store.canUseAI {
                Section("Progress report entry") {
                    ProgressDraftView(goal: goal, student: student)
                }
            }
        }
        .themedList()
        .navigationTitle(goal.area.title)
        #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            if let plan {
                ToolbarItem {
                    StartSessionButton(goals: [
                        SessionGoal(
                            student: student, goal: goal, plan: plan,
                            history: store.dataPoints(for: goal))
                    ])
                }
            }
            if store.canRecordData, plan != nil {
                ToolbarItem {
                    Button {
                        recording = true
                    } label: {
                        Label("Record data", systemImage: "plus.circle.fill")
                    }
                    .accessibilityIdentifier(AccessibilityID.recordData)
                }
            }
        }
        .sheet(isPresented: $recording) {
            if let plan {
                DataEntryView(goal: goal, plan: plan)
            }
        }
    }
}

private struct Statistics: View {
    let progress: GoalProgress

    var body: some View {
        if let average = progress.recentAverage {
            LabeledContent(
                "Last three sessions", value: ValueFormat.string(average, for: progress.plan))
        }
        if let trend = progress.trendPerWeek {
            LabeledContent(
                "Trend",
                value:
                    "\(trend >= 0 ? "+" : "-")\(ValueFormat.string(abs(trend), for: progress.plan)) per week"
            )
        }
    }
}
