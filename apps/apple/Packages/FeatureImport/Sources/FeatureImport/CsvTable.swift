import Foundation

/// A parsed spreadsheet export: the header row and the rows under it.
public struct CsvTable: Equatable, Sendable {
    public var headers: [String]
    public var rows: [[String]]

    public init(headers: [String], rows: [[String]]) {
        self.headers = headers
        self.rows = rows
    }
}

public enum CsvError: Error, Equatable, Sendable {
    case emptyFile
    case tooManyRows
    case tooManyColumns
    case fieldTooLong
    case unterminatedQuote

    /// What to tell the teacher.
    public var message: String {
        switch self {
        case .emptyFile: "The file is empty."
        case .tooManyRows: "The file has more than \(CsvReader.maxRows) students. Split it and import in parts."
        case .tooManyColumns: "The file has more than \(CsvReader.maxColumns) columns."
        case .fieldTooLong: "A cell is longer than \(CsvReader.maxFieldLength) characters. Check that this is the right file."
        case .unterminatedQuote: "A quoted cell is never closed. Check the file for a stray quote mark."
        }
    }
}

/// Reads comma-separated text as spreadsheets write it: quoted cells, doubled quotes, line breaks inside
/// quotes, Windows or Mac line endings and a leading byte-order mark. Bounded so an odd file cannot
/// use up memory.
public enum CsvReader {
    public static let maxRows = 500
    public static let maxColumns = 40
    public static let maxFieldLength = 200

    public static func parse(_ text: String) throws -> CsvTable {
        var source = Substring(text)
        if source.first == "\u{FEFF}" { source = source.dropFirst() }

        var records: [[String]] = []
        var row: [String] = []
        var field = ""
        var inQuotes = false
        var fieldWasQuoted = false

        func endField() throws {
            guard field.count <= maxFieldLength else { throw CsvError.fieldTooLong }
            row.append(field)
            guard row.count <= maxColumns else { throw CsvError.tooManyColumns }
            field = ""
            fieldWasQuoted = false
        }
        func endRow() throws {
            try endField()
            // A blank line (a trailing newline, or empty rows in a spreadsheet export) is not a row.
            if !(row.count == 1 && row[0].isEmpty) { records.append(row) }
            guard records.count <= maxRows + 1 else { throw CsvError.tooManyRows }
            row = []
        }

        var index = source.startIndex
        while index < source.endIndex {
            let ch = source[index]
            let next = source.index(after: index)
            if inQuotes {
                if ch == "\"" {
                    if next < source.endIndex, source[next] == "\"" {
                        field.append("\"")
                        index = source.index(after: next)
                        continue
                    }
                    inQuotes = false
                } else {
                    field.append(ch)
                    guard field.count <= maxFieldLength else { throw CsvError.fieldTooLong }
                }
            } else if ch == "\"" && field.isEmpty && !fieldWasQuoted {
                inQuotes = true
                fieldWasQuoted = true
            } else if ch == "," {
                try endField()
            } else if ch == "\n" || ch == "\r" || ch == "\r\n" {
                // Swift joins "\r\n" into one Character, so all three line endings land here.
                try endRow()
            } else {
                field.append(ch)
            }
            index = next
        }
        if inQuotes { throw CsvError.unterminatedQuote }
        if !field.isEmpty || !row.isEmpty || fieldWasQuoted { try endRow() }

        guard let head = records.first else { throw CsvError.emptyFile }
        let headers = head.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        let body = records.dropFirst().map { record in
            (0..<headers.count).map { i in
                i < record.count ? record[i].trimmingCharacters(in: .whitespacesAndNewlines) : ""
            }
        }
        return CsvTable(headers: headers, rows: body)
    }
}
