// Small helpers for the guided import screen: what a column holds, so the teacher can check a match.
import type { CsvTable } from "./csv.ts";

const SAMPLE_COUNT = 3;
const SAMPLE_WIDTH = 24;

/** A few different, non-empty values from one column, shortened, in file order. */
export function columnSamples(table: CsvTable, column: number, count = SAMPLE_COUNT): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of table.rows) {
    const raw = (row[column] ?? "").trim();
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw.length > SAMPLE_WIDTH ? `${raw.slice(0, SAMPLE_WIDTH - 1)}…` : raw);
    if (out.length >= count) break;
  }
  return out;
}

/** "Examples: 3, K, Seventh" for a column, or a note when it is empty or missing. */
export function sampleLine(table: CsvTable, column: number | undefined): string {
  if (column === undefined) return "";
  const samples = columnSamples(table, column);
  return samples.length === 0
    ? "This column is empty in the file."
    : `Examples: ${samples.join(", ")}`;
}
