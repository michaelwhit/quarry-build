import Foundation

/// A piece of a student record a spreadsheet column can fill.
public enum ImportField: CaseIterable, Hashable, Sendable {
    case firstName, lastName, preferredName, grade, school

    public var title: String {
        switch self {
        case .firstName: "First name"
        case .lastName: "Last name"
        case .preferredName: "Preferred name"
        case .grade: "Grade"
        case .school: "School"
        }
    }

    public var isRequired: Bool {
        switch self {
        case .firstName, .lastName, .grade: true
        case .preferredName, .school: false
        }
    }

    /// Header names a spreadsheet commonly uses, compared without case, spaces, underscores or hyphens.
    var aliases: [String] {
        switch self {
        case .firstName: ["firstname", "first", "givenname", "fname"]
        case .lastName: ["lastname", "last", "surname", "familyname", "lname"]
        case .preferredName: ["preferredname", "preferred", "nickname", "goesby"]
        case .grade: ["grade", "gradelevel", "gr", "currentgrade"]
        case .school: ["school", "schoolname", "building", "site"]
        }
    }
}

/// Which spreadsheet column fills which field.
public struct ColumnMapping: Equatable, Sendable {
    public var columns: [ImportField: Int]

    public init(columns: [ImportField: Int] = [:]) {
        self.columns = columns
    }

    /// Compares header names the way people write them: no case, spaces, underscores or hyphens.
    static func key(_ header: String) -> String {
        header.lowercased().filter { $0 != " " && $0 != "_" && $0 != "-" }
    }

    /// Guesses the mapping from the header row. A column fills at most one field.
    public static func detect(headers: [String]) -> ColumnMapping {
        let keys = headers.map(key)
        var mapping = ColumnMapping()
        var taken = Set<Int>()
        for field in ImportField.allCases {
            if let index = keys.indices.first(where: { !taken.contains($0) && field.aliases.contains(keys[$0]) }) {
                mapping.columns[field] = index
                taken.insert(index)
            }
        }
        return mapping
    }

    /// True when every required field has a column.
    public var isComplete: Bool {
        ImportField.allCases.filter(\.isRequired).allSatisfy { columns[$0] != nil }
    }

    func value(_ field: ImportField, in row: [String]) -> String {
        guard let index = columns[field], index < row.count else { return "" }
        return row[index]
    }
}
