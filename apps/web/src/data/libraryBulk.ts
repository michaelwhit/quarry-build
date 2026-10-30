import type { AccommodationItem } from "./library.ts";
import { vagueFrequency } from "./libraryText.ts";

// Adding several library accommodations to one student in one go. The library wording is used as it
// stands; anything the student already has, and anything with wording the single-add form would
// refuse, is left out and counted so the teacher can see why.

export interface BulkPlan {
  add: AccommodationItem[];
  skip: AccommodationItem[];
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function planBulk(picked: AccommodationItem[], studentTitles: string[]): BulkPlan {
  const add: AccommodationItem[] = [];
  const skip: AccommodationItem[] = [];
  for (const a of picked) {
    const blank = !a.location.trim() || !a.frequency.trim() || !a.duration.trim();
    const have =
      studentTitles.some((t) => same(t, a.title)) || add.some((x) => same(x.title, a.title));
    (blank || vagueFrequency(a.frequency) || have ? skip : add).push(a);
  }
  return { add, skip };
}

const many = (n: number) => `${n} ${n === 1 ? "accommodation" : "accommodations"}`;

/** What happened, in words: how many were added and how many were left out. */
export function bulkMessage(name: string, added: number, skipped: number): string {
  const tail = skipped > 0 ? ` Left out ${skipped}: already there or not usable.` : "";
  if (added === 0) return `${name}: nothing was added.${tail}`;
  return `${name}: added ${many(added)}.${tail}`;
}
