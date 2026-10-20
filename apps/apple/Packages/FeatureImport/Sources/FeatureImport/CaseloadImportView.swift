import CoreModels
import DesignSystem
import Persistence
import SwiftUI
import UniformTypeIdentifiers

/// Add many students at once from a spreadsheet export: pick the file, check which column is which,
/// look over the preview, then confirm. Nothing is added until the teacher confirms.
public struct CaseloadImportView: View {
    @Environment(PrototypeStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    /// Largest file read, so a wrong pick cannot fill memory.
    static let maxFileBytes = 1_000_000

    private let onImported: (Int) -> Void

    @State private var showPicker = false
    @State private var fileName: String?
    @State private var table: CsvTable?
    @State private var mapping = ColumnMapping()
    @State private var defaultSchoolID: UUID?
    @State private var problem: String?
    @State private var addedCount: Int?

    public init(onImported: @escaping (Int) -> Void = { _ in }) {
        self.onImported = onImported
    }

    private var schools: [SchoolChoice] {
        store.dataset.schools.map { SchoolChoice(id: $0.id, name: $0.name) }
    }

    private var plan: ImportPlan? {
        guard let table, mapping.isComplete else { return nil }
        let known = store.visibleStudents.map {
            KnownStudent(firstName: $0.firstName, lastName: $0.lastName, grade: $0.grade)
        }
        return ImportPlanner.plan(
            table: table, mapping: mapping, schools: schools, defaultSchoolID: defaultSchoolID,
            existing: known)
    }

    public var body: some View {
        NavigationStack {
            Form {
                fileSection
                if let table {
                    mappingSection(table)
                    if let plan { previewSection(plan) }
                }
                if let problem {
                    Section {
                        Text(problem).foregroundStyle(Theme.warn)
                            .accessibilityIdentifier(ImportID.problem)
                    }
                }
            }
            .formStyle(.grouped)
            .themedList()
            .navigationTitle("Import students")
            #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(addedCount == nil ? "Cancel" : "Done") { dismiss() }
                        .accessibilityIdentifier(ImportID.cancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add students", action: confirm)
                        .disabled((plan?.readyCount ?? 0) == 0 || addedCount != nil)
                        .accessibilityIdentifier(ImportID.confirm)
                }
            }
            .fileImporter(
                isPresented: $showPicker, allowedContentTypes: [.commaSeparatedText, .plainText],
                onCompletion: load)
        }
        #if os(macOS)
            .frame(minWidth: 460, minHeight: 520)
        #endif
    }

    private var fileSection: some View {
        Section {
            Button(table == nil ? "Choose a file" : "Choose a different file") { showPicker = true }
                .accessibilityIdentifier(ImportID.chooseFile)
            if let fileName {
                Text(fileName).foregroundStyle(Theme.muted)
            }
        } footer: {
            Text(
                "Use a spreadsheet saved as CSV with one student per row. This build holds practice data only. Use made-up names."
            )
        }
    }

    private func mappingSection(_ table: CsvTable) -> some View {
        Section {
            ForEach(ImportField.allCases, id: \.self) { field in
                Picker(field.isRequired ? field.title : "\(field.title) (optional)", selection: columnBinding(field)) {
                    Text("Not in the file").tag(Int?.none)
                    ForEach(Array(table.headers.enumerated()), id: \.offset) { index, header in
                        Text(header.isEmpty ? "Column \(index + 1)" : header).tag(Int?.some(index))
                    }
                }
                .accessibilityIdentifier(ImportID.column(field))
            }
            Picker("School for every student", selection: $defaultSchoolID) {
                Text("Choose").tag(UUID?.none)
                ForEach(schools, id: \.id) { school in
                    Text(school.name.replacingOccurrences(of: " (synthetic)", with: "")).tag(UUID?.some(school.id))
                }
            }
            .accessibilityIdentifier(ImportID.defaultSchool)
        } header: {
            Text("Which column is which")
        } footer: {
            Text(
                mapping.isComplete
                    ? "A school column in the file wins over the school chosen here."
                    : "Choose a column for first name, last name and grade.")
        }
    }

    private func previewSection(_ plan: ImportPlan) -> some View {
        Section {
            if let added = addedCount {
                Label("\(added) students added.", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(Theme.good)
                    .accessibilityIdentifier(ImportID.done)
            } else {
                Text(summary(plan)).font(.subheadline.weight(.semibold))
                    .accessibilityIdentifier(ImportID.summary)
            }
            ForEach(plan.rows) { row in
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(row.firstName) \(row.lastName)".trimmingCharacters(in: .whitespaces))
                        Text("Grade \(row.grade) · line \(row.id)")
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    statusLabel(row.status)
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier(ImportID.row(row.id))
            }
        } header: {
            Text("Preview")
        }
    }

    @ViewBuilder
    private func statusLabel(_ status: RowStatus) -> some View {
        switch status {
        case .ready:
            Text("Will add").font(.caption).foregroundStyle(Theme.good)
        case .duplicate:
            Text("Already on the list").font(.caption).foregroundStyle(Theme.muted)
        case .problem(let why):
            Text(why).font(.caption).foregroundStyle(Theme.warn).multilineTextAlignment(.trailing)
        }
    }

    private func summary(_ plan: ImportPlan) -> String {
        var parts = ["\(plan.readyCount) to add"]
        if plan.duplicateCount > 0 { parts.append("\(plan.duplicateCount) already on the list") }
        if plan.problemCount > 0 { parts.append("\(plan.problemCount) to fix in the file") }
        return parts.joined(separator: ", ")
    }

    private func columnBinding(_ field: ImportField) -> Binding<Int?> {
        Binding(
            get: { mapping.columns[field] },
            set: { mapping.columns[field] = $0 })
    }

    private func load(_ result: Result<URL, Error>) {
        problem = nil
        addedCount = nil
        guard case .success(let url) = result else {
            if case .failure = result { problem = "Could not open that file." }
            return
        }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size <= Self.maxFileBytes else {
                problem = "That file is larger than 1 MB. Check that it is the right file."
                return
            }
            let data = try Data(contentsOf: url)
            guard let text = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) else {
                problem = "That file is not a spreadsheet saved as CSV."
                return
            }
            let parsed = try CsvReader.parse(text)
            table = parsed
            fileName = url.lastPathComponent
            mapping = ColumnMapping.detect(headers: parsed.headers)
        } catch let error as CsvError {
            table = nil
            problem = error.message
        } catch {
            table = nil
            problem = "Could not open that file."
        }
    }

    private func confirm() {
        guard let plan else { return }
        problem = nil
        let rows = plan.ready
        let entries = rows.compactMap { row -> PrototypeStore.NewStudent? in
            guard let schoolID = row.schoolID else { return nil }
            return PrototypeStore.NewStudent(
                firstName: row.firstName, lastName: row.lastName, preferredName: row.preferredName,
                grade: row.grade, schoolID: schoolID)
        }
        guard entries.count == rows.count else {
            problem = "Choose a school for the whole file."
            return
        }
        do {
            // One save for the whole file: either every student is added or none is.
            let added = try store.addStudents(entries)
            if !added.isEmpty { onImported(added.count) }
            addedCount = added.count
        } catch PrototypeStore.StoreError.invalidBatchEntry(let index, _) {
            let line = rows.indices.contains(index) ? rows[index].id : index + 2
            problem = "Line \(line) could not be added, so no students were added. Fix it in the file and try again."
        } catch {
            problem = "Could not add students. Nothing was added. Try again."
        }
    }
}

enum ImportID {
    static let chooseFile = "import-choose-file"
    static let defaultSchool = "import-default-school"
    static let confirm = "import-confirm"
    static let cancel = "import-cancel"
    static let summary = "import-summary"
    static let problem = "import-problem"
    static let done = "import-done"
    static func column(_ field: ImportField) -> String { "import-column-\(field.title.lowercased().replacingOccurrences(of: " ", with: "-"))" }
    static func row(_ line: Int) -> String { "import-row-\(line)" }
}
