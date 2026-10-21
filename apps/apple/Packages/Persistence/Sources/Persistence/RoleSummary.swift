import CoreModels

extension RoleCapabilities {
    /// One plain sentence or two on what this role sees and can do, for the demo sign-in list.
    /// Built from the capabilities so it cannot drift from what the screens really show.
    public var whatYouWillSee: String {
        let seen: String
        switch scope {
        case .allStudents: seen = "Every student in the district."
        case .building: seen = "Students in your building."
        case .caseload: seen = "Your caseload."
        case .servedStudents: seen = "Students you serve."
        case .delegatedGoals:
            seen = minimizedStudentView
                ? "Only the goals given to you, with first names." : "The goals given to you."
        case .none: seen = "No student information."
        }
        var can: [String] = []
        if canRecordData { can.append("record data") }
        if canEditIEP { can.append("draft and approve goals") }
        if canUseAI { can.append("use AI drafts") }
        if canExport { can.append("export") }
        if canDelegateGoals { can.append("give goals to paraprofessionals") }
        if canManageStaff { can.append("manage staff and roles") }
        var text = seen
        if let last = can.last {
            let list = can.count == 1 ? last : can.dropLast().joined(separator: ", ") + " and " + last
            text += " You can \(list)."
        }
        if iPhoneOnly { text += " Works on iPhone only." }
        return text
    }
}
