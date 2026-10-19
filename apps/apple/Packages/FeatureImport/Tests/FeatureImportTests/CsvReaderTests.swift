import Testing

@testable import FeatureImport

struct CsvReaderTests {
    @Test func readsHeadersAndRows() throws {
        let table = try CsvReader.parse("First,Last\nAva,Stone\nBen,Reed\n")
        #expect(table.headers == ["First", "Last"])
        #expect(table.rows == [["Ava", "Stone"], ["Ben", "Reed"]])
    }

    @Test func handlesQuotesBomAndWindowsLineEndings() throws {
        let table = try CsvReader.parse("\u{FEFF}Name,Note\r\n\"Stone, Ava\",\"says \"\"hi\"\"\"\r\n")
        #expect(table.headers == ["Name", "Note"])
        #expect(table.rows == [["Stone, Ava", "says \"hi\""]])
    }

    @Test func skipsBlankRowsAndPadsShortRows() throws {
        let table = try CsvReader.parse("A,B,C\n\n1,2\n")
        #expect(table.rows == [["1", "2", ""]])
    }

    @Test func rejectsBadFiles() {
        #expect(throws: CsvError.emptyFile) { try CsvReader.parse("") }
        #expect(throws: CsvError.unterminatedQuote) { try CsvReader.parse("A\n\"open") }
        let wide = (0...CsvReader.maxColumns).map { "c\($0)" }.joined(separator: ",")
        #expect(throws: CsvError.tooManyColumns) { try CsvReader.parse(wide) }
        let long = String(repeating: "x", count: CsvReader.maxFieldLength + 1)
        #expect(throws: CsvError.fieldTooLong) { try CsvReader.parse("A\n\(long)") }
        let many = "A\n" + (0...CsvReader.maxRows).map { "r\($0)" }.joined(separator: "\n")
        #expect(throws: CsvError.tooManyRows) { try CsvReader.parse(many) }
    }

    @Test func acceptsExactlyTheRowLimit() throws {
        let text = "A\n" + (1...CsvReader.maxRows).map { "r\($0)" }.joined(separator: "\n")
        #expect(try CsvReader.parse(text).rows.count == CsvReader.maxRows)
    }
}
