import Foundation
import Testing

@testable import DesignSystem

@Suite("AccessibilityID")
struct AccessibilityIDTests {
    private let fixed: [String] = [
        AccessibilityID.caseloadList, AccessibilityID.dashboard, AccessibilityID.dashboardKPIs,
        AccessibilityID.showDashboard, AccessibilityID.goalList, AccessibilityID.recordData,
        AccessibilityID.dataCorrect, AccessibilityID.dataIncorrect, AccessibilityID.dataUndo,
        AccessibilityID.dataTimerToggle, AccessibilityID.dataNote, AccessibilityID.dataSave,
        AccessibilityID.dataCancel, AccessibilityID.draftComment, AccessibilityID.draftSufficient,
        AccessibilityID.draftText, AccessibilityID.draftApprove, AccessibilityID.draftReject,
        AccessibilityID.copyForSRS, AccessibilityID.undoApproval, AccessibilityID.accountMenu,
        AccessibilityID.resetDemoData, AccessibilityID.resetConfirm, AccessibilityID.signOut,
        AccessibilityID.signInList, AccessibilityID.homeNumbers,
    ]

    @Test("fixed identifiers are non-empty and unique")
    func uniqueFixed() {
        #expect(fixed.allSatisfy { !$0.isEmpty })
        #expect(Set(fixed).count == fixed.count)
    }

    @Test("row identifiers carry the record id and differ per record")
    func rows() {
        let a = UUID()
        let b = UUID()
        let makers: [(UUID) -> String] = [
            AccessibilityID.studentRow, AccessibilityID.goalRow, AccessibilityID.dashboardRow,
            AccessibilityID.signInRow,
        ]
        for make in makers {
            #expect(make(a).hasSuffix(a.uuidString))
            #expect(make(a) != make(b))
        }
        #expect(Set(makers.map { $0(a) }).count == makers.count)
    }

    @Test("card identifiers are stable slugs of the title")
    func kpis() {
        #expect(AccessibilityID.kpi("Needs a look") == "kpi-needs-a-look")
        #expect(AccessibilityID.kpi("Reports approved") == "kpi-reports-approved")
        #expect(!fixed.contains(AccessibilityID.kpi("Students")))
        #expect(AccessibilityID.homeTile("Draft from evaluation") == "home-tile-draft-from-evaluation")
        #expect(AccessibilityID.tab("home") == "tab-home")
    }
}
