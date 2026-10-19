import { CsvError } from "./csv.ts";

/**
 * Which column of the uploaded file feeds each field. The SRS caseload export and a PowerSchool
 * report will not share headers (we have no sample of either yet), so the director can override
 * any of these per upload. Matching ignores case, spaces, underscores and hyphens.
 */
export type ColumnMapping = Partial<Record<string, string>>;

const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

export function resolveColumns<F extends string>(
  headers: string[],
  aliases: Record<F, string[]>,
  override: ColumnMapping | undefined,
): Record<F, string | undefined> {
  const byNorm = new Map(headers.map((h) => [norm(h), h]));
  const out = {} as Record<F, string | undefined>;
  for (const field of Object.keys(aliases) as F[]) {
    const wanted = override?.[field];
    if (wanted !== undefined) {
      const found = byNorm.get(norm(wanted));
      if (!found) throw new CsvError(`mapped_column_missing:${field}`);
      out[field] = found;
      continue;
    }
    out[field] = aliases[field].map((a) => byNorm.get(norm(a))).find((h) => h !== undefined);
  }
  return out;
}
