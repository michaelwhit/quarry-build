import { beforeEach, describe, expect, it } from "vitest";
import {
  type Drafter,
  type EvScore,
  type EvStatement,
  approveSlot,
  blankScore,
  blankStatement,
  checkSlot,
  confirmEvidence,
  draftSlot,
  fill,
  getPl,
  mockDrafter,
  resetPlForTests,
  saveScore,
  saveStatement,
  setSlotText,
  slotEvidence,
  usePlStorage,
} from "../src/data/presentLevels.ts";

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
const ctx = { who: "Practice Case Manager", now: new Date("2026-10-21T15:00:00Z") };
const TODAY = "2026-10-21";
const SID = "stu-1";

beforeEach(() => {
  usePlStorage(mem());
  resetPlForTests();
});

function addScore(patch: Partial<EvScore>) {
  const rec = getPl(SID);
  const s = {
    ...blankScore(rec),
    measure: "Reading Fluency",
    value: "78",
    testedOn: "2026-09-15",
    descriptor: "Below Average",
    ...patch,
  };
  saveScore(rec, s, ctx);
  expect(confirmEvidence(getPl(SID), s.id, ctx, TODAY)).toBe(true);
  return s;
}
function addStatement(patch: Partial<EvStatement>) {
  const rec = getPl(SID);
  const s = { ...blankStatement(rec), text: "Reads short passages with many stops.", ...patch };
  saveStatement(rec, s, ctx);
  expect(confirmEvidence(getPl(SID), s.id, ctx, TODAY)).toBe(true);
  return s;
}
const READ = "plaafp.reading_literacy";

describe("fixes after review of 26a", () => {
  it("a score value with regex characters does not break checking or approval", async () => {
    addScore({ kind: "raw", value: "+5" });
    addStatement({});
    await draftSlot(getPl(SID), READ, "Maria", [], mockDrafter, ctx);
    setSlotText(getPl(SID), READ, "Maria scored +5 on fluency.", ctx);
    expect(() => checkSlot(READ, getPl(SID).slots[READ], getPl(SID), TODAY)).not.toThrow();
    expect(approveSlot(getPl(SID), READ, ctx, TODAY)).toBe(true);
  });

  it("teacher-written statements with digits are kept; drafter-written digits are still dropped", async () => {
    addStatement({
      text: "Reads 3-syllable words with prompts",
      implication: "Needs 2 extra minutes.",
    });
    await draftSlot(getPl(SID), READ, "Maria", [], mockDrafter, ctx);
    const text = getPl(SID).slots[READ]!.text;
    expect(text).toContain("reads 3-syllable words with prompts.");
    expect(text).toContain("needs 2 extra minutes.");
    const ev = slotEvidence(getPl(SID), READ);
    const r = fill([{ template: "{{student}} read 3 words.", cites: [] }], ev, "Maria");
    expect(r.sentences).toEqual([]);
  });

  it("an empty statement field drops the sentence instead of printing a blank", () => {
    const st = addStatement({ implication: "" });
    const ev = slotEvidence(getPl(SID), READ);
    const r = fill([{ template: `Impact: {{implication:${st.id}}}`, cites: [] }], ev, "Maria");
    expect(r.sentences).toEqual([]);
    expect(r.dropped).toHaveLength(1);
  });

  it("a draft that returns after the section was approved does not overwrite it", async () => {
    addScore({ source: "classroom", area: "reading" });
    addStatement({});
    await draftSlot(getPl(SID), READ, "Maria", [], mockDrafter, ctx);
    const slow: Drafter = {
      id: "slow",
      async draft(req) {
        // The teacher approves while the drafter is still working.
        expect(approveSlot(getPl(SID), READ, ctx, TODAY)).toBe(true);
        return mockDrafter.draft(req);
      },
    };
    const before = getPl(SID).slots[READ]!;
    // The slot is approved only after draftSlot's first check, as in the real race.
    const rec = { ...getPl(SID), slots: {} };
    const out = await draftSlot(rec, READ, "Maria", [], slow, ctx);
    expect(out.join(" ")).toMatch(/approved while drafting/);
    expect(getPl(SID).slots[READ]!.approved).toBe(true);
    expect(getPl(SID).slots[READ]!.text).toBe(before.text);
  });

  it("a draft is not saved if the evidence changed while it was being made", async () => {
    const s = addScore({ source: "classroom", area: "reading" });
    addStatement({});
    const edits: Drafter = {
      id: "edits",
      async draft(req) {
        saveScore(getPl(SID), { ...s, value: "80" }, ctx);
        confirmEvidence(getPl(SID), s.id, ctx, TODAY);
        return mockDrafter.draft(req);
      },
    };
    const out = await draftSlot(getPl(SID), READ, "Maria", [], edits, ctx);
    expect(out.join(" ")).toMatch(/evidence changed while drafting/);
    expect(getPl(SID).slots[READ]).toBeUndefined();
  });

  it("the no-statement warning clears on the state and district section once a statement covers the area", async () => {
    const key = "summary.state_district_results";
    addScore({ source: "state_district", area: "math", measure: "State math" });
    await draftSlot(getPl(SID), key, "Maria", [], mockDrafter, ctx);
    const warn = () =>
      checkSlot(key, getPl(SID).slots[key], getPl(SID), TODAY).some((p) =>
        /no statement of what the student can/.test(p.text),
      );
    expect(warn()).toBe(true);
    addStatement({ area: "math", text: "Solves one-step problems with a number line." });
    expect(warn()).toBe(false);
  });
});
