import DesignSystem
import Persistence
import SwiftUI
import UniformTypeIdentifiers

/// The More tab: who is signed in, demo data reset, sign out. The account lives here, not in the
/// top bar, so the TEST DATA badge never covers it.
struct MoreView: View {
    @Environment(PrototypeStore.self) private var store
    @State private var confirmReset = false
    @State private var exportDocument = PracticeFileDocument(data: Data())
    @State private var exporting = false
    @State private var importing = false
    @State private var fileMessage = ""

    var body: some View {
        List {
            if let staff = store.currentStaff {
                Section("Signed in") {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(staff.displayName).font(.headline)
                        Text(staff.role.title).font(.subheadline).foregroundStyle(Theme.muted)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier(AccessibilityID.accountMenu)
                }
            }
            if store.roleView.canManageStaff {
                Section {
                    NavigationLink("Staff and roles") { StaffAndRolesScreen() }
                        .frame(minHeight: Spacing.minTapTarget, alignment: .leading)
                        .accessibilityIdentifier("more-staff-and-roles")
                }
            }
            if store.canExportFiles {
                Section {
                    Text(
                        "The file holds made-up data only. Load only files you saved from this app; "
                            + "loading adds the sessions that are not already here."
                    )
                    .font(.footnote).foregroundStyle(Theme.muted)
                    Button("Save practice data to a file") { prepareExport() }
                        .disabled(store.exportableSessionCount == 0)
                        .frame(minHeight: Spacing.minTapTarget, alignment: .leading)
                        .accessibilityIdentifier(AccessibilityID.savePracticeFile)
                    Button("Load from a file") { importing = true }
                        .frame(minHeight: Spacing.minTapTarget, alignment: .leading)
                        .accessibilityIdentifier(AccessibilityID.loadPracticeFile)
                    if !fileMessage.isEmpty {
                        Text(fileMessage).font(.footnote)
                            .accessibilityAddTraits(.updatesFrequently)
                    }
                } header: {
                    Text("Save to a file or load from a file")
                }
            }
            Section {
                Button("Reset demo data", role: .destructive) { confirmReset = true }
                    .frame(minHeight: Spacing.minTapTarget, alignment: .leading)
                    .accessibilityIdentifier(AccessibilityID.resetDemoData)
                Button("Sign out") { store.signOut() }
                    .frame(minHeight: Spacing.minTapTarget, alignment: .leading)
                    .accessibilityIdentifier(AccessibilityID.signOut)
            }
        }
        .scrollContentBackground(.hidden)
        .themedScreen()
        .navigationTitle("More")
        .fileExporter(
            isPresented: $exporting, document: exportDocument, contentType: .json,
            defaultFilename: "goalline-practice-\(Self.day())"
        ) { result in
            if case .failure = result { fileMessage = "The file was not saved." }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
            load(result)
        }
        .confirmationDialog(
            "Delete the data you recorded and the progress entries you approved?",
            isPresented: $confirmReset, titleVisibility: .visible
        ) {
            Button("Reset demo data", role: .destructive) { store.resetLocalData() }
                .accessibilityIdentifier(AccessibilityID.resetConfirm)
        }
    }

    private static func day() -> String {
        Date().formatted(.iso8601.year().month().day())
    }

    private func prepareExport() {
        do {
            exportDocument = PracticeFileDocument(data: try store.exportPracticeData())
            fileMessage = ""
            exporting = true
        } catch {
            fileMessage = "The file was not saved."
        }
    }

    private func load(_ result: Result<URL, Error>) {
        guard case .success(let url) = result else {
            fileMessage = "That file could not be read."
            return
        }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        // Read at most one byte past the cap, so a file of unknown or huge size never fills memory.
        guard let handle = try? FileHandle(forReadingFrom: url) else {
            fileMessage = "That file could not be read."
            return
        }
        defer { try? handle.close() }
        guard
            let data = try? handle.read(upToCount: PrototypeStore.maxPracticeFileBytes + 1)
        else {
            fileMessage = "That file could not be read."
            return
        }
        guard data.count <= PrototypeStore.maxPracticeFileBytes else {
            fileMessage = "That file is too large."
            return
        }
        do {
            let added = try store.importPracticeData(data)
            fileMessage = "Loaded \(added) session\(added == 1 ? "" : "s")."
        } catch PrototypeStore.FileError.tooLarge {
            fileMessage = "That file is too large."
        } catch PrototypeStore.FileError.noSessions {
            fileMessage = "That file has no sessions."
        } catch PrototypeStore.StoreError.saveFailed {
            fileMessage = "The sessions could not be saved. Nothing was changed."
        } catch {
            fileMessage = "That file is not a practice-data export for the students you can see."
        }
    }
}

/// The practice-data file as the system file pickers see it: plain JSON, made-up data only.
struct PracticeFileDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }

    var data: Data

    init(data: Data) {
        self.data = data
    }

    init(configuration: ReadConfiguration) throws {
        data = configuration.file.regularFileContents ?? Data()
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}
