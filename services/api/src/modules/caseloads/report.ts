/** Row-level problems carry the row number, the field and a code, never the cell's text. */
export interface RowError {
  row: number;
  field: string;
  code: string;
}

export interface ImportReport {
  committed: boolean;
  rows: number;
  creates: number;
  updates: number;
  unchanged: number;
  /** Active students absent from the file. Flagged for review, never deleted. */
  missing_from_file?: number;
  errors: RowError[];
}
