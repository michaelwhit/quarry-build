import { BOXES, getConsiderations } from "./considerations.ts";
import { studentById } from "./district.ts";
import { getIepShort } from "./iepShort.ts";
import { getPl } from "./presentLevels.ts";
import { type PwnInput, type RowKind, type RowChange } from "./pwn.ts";
import { getPwnEntry } from "./pwnStore.ts";
import { type ServiceKind, getServices } from "./serviceRows.ts";

// Reads the other IEP sections and the teacher's own notice entries, and hands them to the draft
// builder. Nothing is invented here: a section that is not filled in yet is reported in `missing`.

const KIND: Record<ServiceKind, RowKind> = {
  special_education: "special_education",
  related: "related",
  supports_personnel: "school_personnel",
  accommodation: "accommodation",
};

export interface PwnSources {
  input: PwnInput;
  /** Sections to finish before the notice can be drafted. */
  missing: string[];
}

export function gatherPwn(studentId: string): PwnSources {
  const entry = getPwnEntry(studentId);
  const change = (id: string): RowChange => entry.changes[id] ?? "added";

  const rows = getServices(studentId).rows.map((r) => ({
    kind: KIND[r.kind],
    title: r.title,
    change: change(r.id),
    frequency: r.frequency,
    duration: r.duration,
    location: r.location,
    start: r.start,
    end: r.end,
  }));

  const goals = (studentById(studentId)?.goals ?? []).map(({ goal }, i) => ({
    area: goal.area ? String(goal.area).replaceAll("_", " ") : `Goal ${i + 1}`,
    change: change(goal.id),
  }));

  const considerations = Object.entries(getConsiderations(studentId)).flatMap(([id, c]) => {
    const box = BOXES.find((b) => b.id === id);
    return box && c.choice === "not_needed"
      ? [{ label: box.label, choice: "considered_not_needed" as const, reason: c.text }]
      : [];
  });

  const esy = getIepShort(studentId).esy;
  const instruments = [
    ...new Set(
      getPl(studentId)
        .scores.filter((s) => s.state === "confirmed" && s.instrument.trim())
        .map((s) => s.instrument.trim()),
    ),
  ];

  const missing = [
    ...(esy ? [] : ["Extended school year: choose not needed or needed."]),
    ...(rows.length === 0 && goals.length === 0 ? ["Add services or goals first."] : []),
  ];

  const input: PwnInput = {
    noteDate: entry.noteDate,
    deliveryDate: entry.deliveryDate,
    deliveryMethod: entry.deliveryMethod,
    rows,
    goals,
    considerations,
    ...(esy
      ? {
          esy: {
            choice:
              esy.choice === "not_needed"
                ? ("considered_not_needed" as const)
                : ("needed" as const),
            reason: esy.text,
          },
        }
      : {}),
    alternatives: entry.alternatives,
    evaluations: instruments,
    otherFactors: entry.otherFactors,
    reasons: entry.reasons,
    contact: entry.contact,
  };
  return { input, missing };
}
