import Foundation

/// A school a student can be placed in.
public struct SchoolChoice: Equatable, Hashable, Sendable {
    public var id: UUID
    public var name: String

    public init(id: UUID, name: String) {
        self.id = id
        self.name = name
    }
}

/// A student already on the list, used to spot repeats.
public struct KnownStudent: Equatable, Sendable {
    public var firstName: String
    public var lastName: String
    public var grade: String

    public init(firstName: String, lastName: String, grade: String) {
        self.firstName = firstName
        self.lastName = lastName
        self.grade = grade
    }
}

public enum RowStatus: Equatable, Sendable {
    case ready
    case duplicate
    /// Cannot be added; the text says why, in plain words.
    case problem(String)
}

public struct PlannedRow: Equatable, Identifiable, Sendable {
    /// The row's position in the file, counting the header as line 1.
    public var id: Int
    public var firstName: String
    public var lastName: String
    public var preferredName: String
    public var grade: String
    public var schoolID: UUID?
    public var status: RowStatus
}

/// What confirming the import would do, row by row.
public struct ImportPlan: Equatable, Sendable {
    public var rows: [PlannedRow]

    public var ready: [PlannedRow] { rows.filter { $0.status == .ready } }
    public var readyCount: Int { ready.count }
    public var duplicateCount: Int { rows.filter { $0.status == .duplicate }.count }
    public var problemCount: Int {
        rows.filter { if case .problem = $0.status { true } else { false } }.count
    }
}

public enum ImportPlanner {
    /// Longest name the store accepts.
    public static let maxNameLength = 100

    public static func plan(
        table: CsvTable, mapping: ColumnMapping, schools: [SchoolChoice], defaultSchoolID: UUID?,
        existing: [KnownStudent]
    ) -> ImportPlan {
        var seen = Set(existing.map { identity($0.firstName, $0.lastName, $0.grade) })
        var rows: [PlannedRow] = []
        for (offset, cells) in table.rows.enumerated() {
            let first = mapping.value(.firstName, in: cells)
            let last = mapping.value(.lastName, in: cells)
            let nick = mapping.value(.preferredName, in: cells)
            let gradeText = mapping.value(.grade, in: cells)
            let schoolText = mapping.value(.school, in: cells)

            var schoolID = defaultSchoolID
            var problem: String?
            if first.isEmpty {
                problem = "No first name."
            } else if last.isEmpty {
                problem = "No last name."
            } else if [first, last, nick].contains(where: { $0.count > maxNameLength }) {
                problem = "A name is longer than \(maxNameLength) characters."
            }
            let grade = normalizedGrade(gradeText)
            if problem == nil, grade == nil {
                problem = gradeText.isEmpty ? "No grade." : "Grade \"\(gradeText)\" is not one of PK, K or 1 to 12."
            }
            if problem == nil, !schoolText.isEmpty {
                if let match = school(named: schoolText, in: schools) {
                    schoolID = match.id
                } else {
                    problem = "School \"\(schoolText)\" is not on the list."
                }
            }
            if problem == nil, schoolID == nil { problem = "No school. Choose one for the whole file." }

            var status = RowStatus.ready
            if let problem {
                status = .problem(problem)
            } else if let grade {
                if !seen.insert(identity(first, last, grade)).inserted { status = .duplicate }
            }
            rows.append(
                PlannedRow(
                    id: offset + 2, firstName: first, lastName: last, preferredName: nick,
                    grade: grade ?? gradeText, schoolID: schoolID, status: status))
        }
        return ImportPlan(rows: rows)
    }

    static func identity(_ first: String, _ last: String, _ grade: String) -> String {
        [first, last, grade].map { $0.lowercased() }.joined(separator: "|")
    }

    /// Matches a school by name, ignoring case and a trailing "(synthetic)" tag.
    static func school(named text: String, in schools: [SchoolChoice]) -> SchoolChoice? {
        let wanted = plainSchoolName(text)
        return schools.first { plainSchoolName($0.name) == wanted }
    }

    static func plainSchoolName(_ name: String) -> String {
        name.replacingOccurrences(of: " (synthetic)", with: "")
            .trimmingCharacters(in: .whitespaces).lowercased()
    }

    /// Turns what a spreadsheet says ("3rd", "Grade 03", "Kindergarten") into PK, K or 1 to 12.
    public static func normalizedGrade(_ text: String) -> String? {
        var value = text.trimmingCharacters(in: .whitespaces).uppercased()
        for prefix in ["GRADE ", "GR. ", "GR "] where value.hasPrefix(prefix) {
            value = String(value.dropFirst(prefix.count)).trimmingCharacters(in: .whitespaces)
        }
        switch value {
        case "PK", "PRE-K", "PREK", "PRESCHOOL", "PRE K": return "PK"
        case "K", "KG", "KINDERGARTEN": return "K"
        default: break
        }
        for suffix in ["ST", "ND", "RD", "TH"] where value.hasSuffix(suffix) {
            value = String(value.dropLast(suffix.count))
        }
        guard !value.isEmpty, value.count <= 2, value.allSatisfy(\.isASCII), value.allSatisfy(\.isNumber),
            let number = Int(value), (1...12).contains(number)
        else { return nil }
        return String(number)
    }
}
