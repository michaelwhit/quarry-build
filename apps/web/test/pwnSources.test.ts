import { beforeEach, describe, expect, it } from "vitest";
import { setRole } from "../src/data/roles.ts";
import { students } from "../src/data/district.ts";
import { loadSample } from "../src/data/workspace.ts";
import {
  resetConsiderationsForTests,
  setConsideration,
  useConsiderationStorage,
} from "../src/data/considerations.ts";
import { resetIepShortForTests, updateIepShort, useIepShortStorage } from "../src/data/iepShort.ts";
import {
  blankScore,
  confirmEvidence,
  getPl,
  resetPlForTests,
  saveScore,
  usePlStorage,
} from "../src/data/presentLevels.ts";
import { draftPwn } from "../src/data/pwn.ts";
import { gatherPwn } from "../src/data/pwnSources.ts";
import { resetPwnForTests, setPwnEntry, usePwnStorage } from "../src/data/pwnStore.ts";
import {
  addServiceRow,
  resetServicesForTests,
  useServicesStorage,
} from "../src/data/serviceRows.ts";

setRole("sped_director");

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
const sid = () => students[0]!.student.id;
const ctx = { who: "Ms. A", now: new Date("2026-10-21T15:00:00Z") };

beforeEach(() => {
  loadSample();
  useServicesStorage(mem());
  resetServicesForTests();
  useConsiderationStorage(mem());
  resetConsiderationsForTests();
  useIepShortStorage(mem());
  resetIepShortForTests();
  usePlStorage(mem());
  resetPlForTests();
  usePwnStorage(mem());
  resetPwnForTests();
});

describe("gatherPwn", () => {
  it("reports ESY as missing until it is answered", () => {
    expect(gatherPwn(sid()).missing).toContain(
      "Extended school year: choose not needed or needed.",
    );
    expect(gatherPwn(sid()).input.esy).toBeUndefined();
    expect(draftPwn(gatherPwn(sid()).input).blocked).toContain(
      "Extended school year: choose not needed or needed.",
    );
    updateIepShort(sid(), (r) => ({ ...r, esy: { choice: "not_needed", text: "Held steady." } }));
    expect(gatherPwn(sid()).missing).toEqual([]);
  });

  it("maps service rows, defaulting unmarked rows to added", () => {
    const row = addServiceRow(sid(), {
      kind: "supports_personnel",
      title: "Consult",
      start: "2027-01-10",
      end: "",
      frequency: "2 times/month",
      duration: "20 min",
      location: "Library",
      followsCalendar: true,
    });
    let r = gatherPwn(sid()).input.rows[0]!;
    expect(r).toMatchObject({ kind: "school_personnel", title: "Consult", change: "added" });
    setPwnEntry(sid(), { changes: { [row.id]: "unchanged" } });
    r = gatherPwn(sid()).input.rows[0]!;
    expect(r.change).toBe("unchanged");
  });

  it("passes only not-needed considerations, with the teacher's reason", () => {
    setConsideration(sid(), "at", { choice: "not_needed", text: "Tools in place." });
    setConsideration(sid(), "lep", { choice: "needed", text: "Needs support." });
    const c = gatherPwn(sid()).input.considerations;
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ choice: "considered_not_needed", reason: "Tools in place." });
  });

  it("lists only confirmed instruments, once each", () => {
    const rec = getPl(sid());
    saveScore(
      rec,
      {
        ...blankScore(rec),
        instrument: "Oral reading probe",
        measure: "WCPM",
        value: "52",
        testedOn: "2026-10-01",
      },
      ctx,
    );
    const r2 = getPl(sid());
    saveScore(
      r2,
      {
        ...blankScore(r2),
        instrument: "Draft only",
        measure: "x",
        value: "1",
        testedOn: "2026-10-01",
      },
      ctx,
    );
    const ids = getPl(sid()).scores.map((s) => s.id);
    confirmEvidence(getPl(sid()), ids[0]!, ctx, "2026-10-21");
    expect(gatherPwn(sid()).input.evaluations).toEqual(["Oral reading probe"]);
  });

  it("builds a draft that is ready once the teacher's entries are filled in", () => {
    addServiceRow(sid(), {
      kind: "special_education",
      title: "Reading instruction",
      start: "2027-01-10",
      end: "",
      frequency: "22 days/semester",
      duration: "15 min/day",
      location: "Resource room",
      followsCalendar: true,
    });
    updateIepShort(sid(), (r) => ({ ...r, esy: { choice: "needed", text: "Summer program." } }));
    const rec = getPl(sid());
    saveScore(
      rec,
      {
        ...blankScore(rec),
        instrument: "Oral reading probe",
        measure: "WCPM",
        value: "52",
        testedOn: "2026-10-01",
      },
      ctx,
    );
    confirmEvidence(getPl(sid()), getPl(sid()).scores[0]!.id, ctx, "2026-10-21");
    setPwnEntry(sid(), {
      noteDate: "2027-01-05",
      reasons: ["Daily practice is needed."],
      contact: { name: "Pat Example", role: "Case manager", phone: "" },
    });
    const draft = draftPwn(gatherPwn(sid()).input);
    expect(draft.blocked.filter((b) => !b.includes("goal"))).toEqual([]);
  });
});
