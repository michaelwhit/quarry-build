import CoreModels
import DesignSystem
import Persistence
import SwiftUI

/// Add a student by hand, or fix the name, grade or school of one already on the list.
public struct StudentFormView: View {
    public enum Mode {
        case add
        case edit(Student)
    }

    @Environment(PrototypeStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    private let mode: Mode
    private let onSaved: (Student) -> Void

    @State private var firstName: String
    @State private var lastName: String
    @State private var preferredName: String
    @State private var grade: String
    @State private var schoolID: UUID?
    @State private var problem: String?
    @State private var confirmingRemoval = false

    public init(mode: Mode, onSaved: @escaping (Student) -> Void = { _ in }) {
        self.mode = mode
        self.onSaved = onSaved
        switch mode {
        case .add:
            _firstName = State(initialValue: "")
            _lastName = State(initialValue: "")
            _preferredName = State(initialValue: "")
            _grade = State(initialValue: "")
            _schoolID = State(initialValue: nil)
        case .edit(let student):
            _firstName = State(initialValue: student.firstName)
            _lastName = State(initialValue: student.lastName)
            _preferredName = State(initialValue: student.preferredName ?? "")
            _grade = State(initialValue: student.grade)
            _schoolID = State(initialValue: student.schoolID)
        }
    }

    private static let standardGrades = ["PK", "K"] + (1...12).map(String.init)

    private var grades: [String] {
        grade.isEmpty || Self.standardGrades.contains(grade)
            ? Self.standardGrades : Self.standardGrades + [grade]
    }

    private var title: String {
        switch mode {
        case .add: "Add student"
        case .edit: "Edit student"
        }
    }

    public var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("First name", text: $firstName)
                        .accessibilityIdentifier(AccessibilityID.studentFirstName)
                    TextField("Last name", text: $lastName)
                        .accessibilityIdentifier(AccessibilityID.studentLastName)
                    TextField("Preferred name (optional)", text: $preferredName)
                        .accessibilityIdentifier(AccessibilityID.studentPreferredName)
                } footer: {
                    Text(
                        "A preferred name is shown on screen instead of the first name and last initial."
                    )
                }
                Section {
                    Picker("Grade", selection: $grade) {
                        Text("Choose").tag("")
                        ForEach(grades, id: \.self) { Text($0).tag($0) }
                    }
                    .accessibilityIdentifier(AccessibilityID.studentGrade)
                    Picker("School", selection: $schoolID) {
                        Text("Choose").tag(UUID?.none)
                        ForEach(store.dataset.schools) { school in
                            Text(school.name.replacingOccurrences(of: " (synthetic)", with: ""))
                                .tag(UUID?.some(school.id))
                        }
                    }
                    .accessibilityIdentifier(AccessibilityID.studentSchool)
                } footer: {
                    Text("This build holds practice data only. Use made-up names.")
                }
                if case .edit = mode {
                    Section {
                        Button("Delete student", role: .destructive) { confirmingRemoval = true }
                            .accessibilityIdentifier(AccessibilityID.removeStudent)
                    }
                }
                if let problem {
                    Section {
                        Text(problem).foregroundStyle(Theme.warn)
                            .accessibilityIdentifier(AccessibilityID.studentFormProblem)
                    }
                }
            }
            .formStyle(.grouped)
            .themedList()
            .confirmationDialog(
                removalTitle, isPresented: $confirmingRemoval, titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive, action: remove)
                    .accessibilityIdentifier(AccessibilityID.removeConfirm)
            } message: {
                Text(removalMessage)
            }
            .navigationTitle(title)
            #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .accessibilityIdentifier(AccessibilityID.studentCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save)
                        .accessibilityIdentifier(AccessibilityID.studentSave)
                }
            }
        }
        #if os(macOS)
            .frame(minWidth: 380, minHeight: 420)
        #endif
    }

    private var removalTitle: String {
        guard case .edit(let student) = mode else { return "" }
        return "Delete \(store.displayName(for: student))?"
    }

    private var removalMessage: String {
        guard case .edit(let student) = mode else { return "" }
        let impact = store.removalImpact(ofStudent: student)
        return "This also deletes \(impact.goals) \(impact.goals == 1 ? "goal" : "goals") and "
            + "\(impact.dataPoints) recorded \(impact.dataPoints == 1 ? "entry" : "entries") "
            + "from the practice data."
    }

    private func remove() {
        guard case .edit(let student) = mode else { return }
        do {
            try store.removeStudent(id: student.id)
            dismiss()
        } catch {
            problem = "Could not delete. Try again."
        }
    }

    private func save() {
        guard let schoolID else {
            problem = "Choose a school."
            return
        }
        do {
            let student: Student
            switch mode {
            case .add:
                student = try store.addStudent(
                    firstName: firstName, lastName: lastName, preferredName: preferredName,
                    grade: grade, schoolID: schoolID)
            case .edit(let current):
                student = try store.updateStudent(
                    id: current.id, firstName: firstName, lastName: lastName,
                    preferredName: preferredName, grade: grade, schoolID: schoolID)
            }
            onSaved(student)
            dismiss()
        } catch PrototypeStore.StoreError.invalidStudent(let field) {
            switch field {
            case .firstNameMissing: problem = "Enter a first name."
            case .lastNameMissing: problem = "Enter a last name."
            case .gradeMissing: problem = "Choose a grade."
            case .nameTooLong: problem = "Names can be up to \(PrototypeStore.maxNameLength) characters."
            }
        } catch {
            problem = "Could not save. Try again."
        }
    }
}
