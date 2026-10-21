import { beforeEach, describe, expect, it } from "vitest";
import {
  type Drafter,
  type EvScore,
  type EvStatement,
  approveSlot,
  basisOf,
  blankScore,
  blankStatement,
  checkSlot,
  confirmEvidence,
  draftSlot,
  fill,
  getPl,
  hasRed,
  mockDrafter,
  reopenSlot,
  requiredContent,
  resetPlForTests,
  saveScore,
  saveStatement,
  scoreProblems,
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
const NAMES = ["Maria", "Lopez"];

beforeEach(() => {
  usePlStorage(mem());
  resetPlForTests();
});

function addScore(patch: Partial<EvScore>) {
  const rec = getPl(SID);
  const s = {
    ...blankScore(rec),
    measure: "Reading Fluency",
    instrument: "Practice ORF",
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

describe("score rows", () => {
  it("must be in range, dated and not from the future", () => {
    const base = { ...blankScore(getPl(SID)), measure: "m", value: "200", testedOn: "2026-09-01" };
    expect(scoreProblems(base, TODAY).join(" ")).toMatch(/40 to 160/);
    expect(
      scoreProblems({ ...base, value: "90", testedOn: "2027-01-01" }, TODAY).join(" "),
    ).toMatch(/future/);
    expect(scoreProblems({ ...base, value: "90", percentile: "100" }, TODAY).join(" ")).toMatch(
      /1 to 99/,
    );
    expect(scoreProblems({ ...base, value: "90" }, TODAY)).toEqual([]);
  });
  it("a row with problems cannot be confirmed", () => {
    const rec = getPl(SID);
    const s = { ...blankScore(rec), measure: "m", value: "abc", testedOn: "2026-09-01" };
    saveScore(rec, s, ctx);
    expect(confirmEvidence(getPl(SID), s.id, ctx, TODAY)).toBe(false);
  });
  it("editing a confirmed row makes it a draft again", () => {
    const s = addScore({});
    saveScore(getPl(SID), { ...s, value: "80" }, ctx);
    expect(getPl(SID).scores[0]!.state).toBe("draft");
  });
});

describe("filling a draft", () => {
  it("puts numbers, dates and the printed label in from the rows", async () => {
    const s = addScore({ percentile: "8", source: "classroom", area: "reading" });
    addStatement({ scoreIds: [s.id] });
    const rec = getPl(SID);
    await draftSlot(rec, "plaafp.reading_literacy", "Maria", NAMES, mockDrafter, ctx);
    const slot = getPl(SID).slots["plaafp.reading_literacy"]!;
    expect(slot.text).toContain("78");
    expect(slot.text).toContain("percentile 8");
    expect(slot.text).toContain("described in the report as Below Average");
    expect(slot.text).toContain("September 15, 2026");
    expect(slot.sentences.every((x) => x.cites.length > 0)).toBe(true);
  });
  it("drops a sentence in which the drafter wrote its own number", () => {
    const s = addScore({});
    const ev = slotEvidence(getPl(SID), "plaafp.reading_literacy");
    const r = fill(
      [
        { template: "{{student}} scored 91.", cites: [s.id] },
        { template: "{{student}} read {{value:" + s.id + "}}.", cites: [] },
      ],
      ev,
      "Maria",
    );
    expect(r.sentences.map((x) => x.text)).toEqual(["Maria read 78."]);
    expect(r.dropped).toHaveLength(1);
  });
  it("drops a sentence with an unknown or empty placeholder", () => {
    const s = addScore({ descriptor: "" });
    const ev = slotEvidence(getPl(SID), "plaafp.reading_literacy");
    const r = fill(
      [
        { template: "{{descriptor:" + s.id + "}}", cites: [] },
        { template: "{{value:nope}}", cites: [] },
      ],
      ev,
      "Maria",
    );
    expect(r.sentences).toEqual([]);
    expect(r.dropped).toHaveLength(2);
  });
  it("never uses age or grade equivalents, or unconfirmed rows", async () => {
    addScore({ kind: "gradeEquivalent", value: "2.5", measure: "Equiv" });
    const rec = getPl(SID);
    saveScore(
      rec,
      { ...blankScore(rec), measure: "Draft only", value: "90", testedOn: "2026-09-01" },
      ctx,
    );
    const out = await draftSlot(
      getPl(SID),
      "plaafp.reading_literacy",
      "Maria",
      NAMES,
      mockDrafter,
      ctx,
    );
    expect(out[0]).toMatch(/No confirmed evidence/);
    expect(getPl(SID).slots["plaafp.reading_literacy"]).toBeUndefined();
  });
  it("sends the drafter no numbers, dates or names", async () => {
    const s = addScore({ measure: "Maria Lopez fluency" });
    addStatement({ text: "Maria loses her place on 3/4/2026.", scoreIds: [s.id] });
    let seen = "";
    const spy: Drafter = {
      id: "spy",
      async draft(req) {
        seen = JSON.stringify(req);
        return [];
      },
    };
    await draftSlot(getPl(SID), "plaafp.reading_literacy", "Maria", NAMES, spy, ctx);
    expect(seen).not.toMatch(/Maria|Lopez|78|2026/);
    expect(seen).toContain("[name]");
  });
  it("holds back a line that looks like a birth date", async () => {
    addStatement({ text: "Date of birth is in the file." });
    const out = await draftSlot(
      getPl(SID),
      "plaafp.reading_literacy",
      "Maria",
      NAMES,
      mockDrafter,
      ctx,
    );
    expect(out.join(" ")).toMatch(/Held back.*birth date/);
    expect(getPl(SID).slots["plaafp.reading_literacy"]).toBeUndefined();
  });
});

describe("slots by source", () => {
  it("routes evidence to the right section", () => {
    addScore({ source: "evaluation", area: "other", measure: "A" });
    addScore({ source: "state_district", area: "math", measure: "B" });
    addScore({ source: "classroom", area: "math", measure: "C" });
    addStatement({ kind: "strength", text: "Persistent." });
    addStatement({ kind: "need", statedBy: "evaluator", text: "Decoding." });
    const rec = getPl(SID);
    const names = (k: string) => slotEvidence(rec, k).scores.map((s) => s.measure);
    expect(names("summary.eval_results")).toEqual(["A"]);
    expect(names("summary.state_district_results")).toEqual(["B"]);
    expect(names("plaafp.math")).toEqual(["C"]);
    expect(slotEvidence(rec, "summary.strengths").statements).toHaveLength(1);
    expect(slotEvidence(rec, "summary.eval_results").statements).toHaveLength(1);
  });
});

describe("checks and approval", () => {
  async function drafted() {
    const s = addScore({});
    addStatement({ scoreIds: [s.id] });
    await draftSlot(getPl(SID), "plaafp.reading_literacy", "Maria", NAMES, mockDrafter, ctx);
    return s;
  }
  it("approves a clean draft and locks it", async () => {
    await drafted();
    expect(approveSlot(getPl(SID), "plaafp.reading_literacy", ctx, TODAY)).toBe(true);
    setSlotText(getPl(SID), "plaafp.reading_literacy", "changed", ctx);
    expect(getPl(SID).slots["plaafp.reading_literacy"]!.text).not.toBe("changed");
    reopenSlot(getPl(SID), "plaafp.reading_literacy", ctx);
    expect(getPl(SID).slots["plaafp.reading_literacy"]!.approved).toBe(false);
    expect(getPl(SID).log.map((l) => l.text)).toContain("Approved PLAAFP: Reading or Literacy");
  });
  it("blocks approval when the evidence changed after the draft", async () => {
    const s = await drafted();
    saveScore(getPl(SID), { ...s, value: "80" }, ctx);
    confirmEvidence(getPl(SID), s.id, ctx, TODAY);
    const p = checkSlot(
      "plaafp.reading_literacy",
      getPl(SID).slots["plaafp.reading_literacy"],
      getPl(SID),
      TODAY,
    );
    expect(hasRed(p)).toBe(true);
    expect(approveSlot(getPl(SID), "plaafp.reading_literacy", ctx, TODAY)).toBe(false);
  });
  it("blocks a relabeled descriptor in the teacher's edit", async () => {
    await drafted();
    setSlotText(
      getPl(SID),
      "plaafp.reading_literacy",
      "Maria scored 78, which is above average.",
      ctx,
    );
    const p = checkSlot(
      "plaafp.reading_literacy",
      getPl(SID).slots["plaafp.reading_literacy"],
      getPl(SID),
      TODAY,
    );
    expect(p.some((x) => x.severity === "red" && /Below Average/.test(x.text))).toBe(true);
  });
  it("warns, without blocking, about stray numbers, grade levels and old data", async () => {
    addScore({ testedOn: "2025-06-01" });
    addStatement({});
    await draftSlot(getPl(SID), "plaafp.reading_literacy", "Maria", NAMES, mockDrafter, ctx);
    setSlotText(
      getPl(SID),
      "plaafp.reading_literacy",
      "Maria reads at a 2nd grade level and scored 91. Below Average.",
      ctx,
    );
    const p = checkSlot(
      "plaafp.reading_literacy",
      getPl(SID).slots["plaafp.reading_literacy"],
      getPl(SID),
      TODAY,
    );
    const t = p.map((x) => x.text).join(" ");
    expect(t).toMatch(/more than 12 months/);
    expect(t).toMatch(/grade levels/);
    expect(t).toMatch(/Check .*91/);
    expect(hasRed(p)).toBe(false);
  });
  it("tracks the NDE required content", () => {
    expect(requiredContent(getPl(SID)).every((r) => !r.met)).toBe(true);
    addScore({});
    addStatement({ kind: "strength", text: "Kind." });
    addStatement({ area: "other", implication: "Needs extra time to move between tasks." });
    setSlotText(getPl(SID), "summary.parent_input", "Family wants more independence.", ctx);
    expect(requiredContent(getPl(SID)).every((r) => r.met)).toBe(true);
  });
  it("lets the teacher write the family section and approve it", () => {
    setSlotText(getPl(SID), "summary.parent_input", "Family wants more independence.", ctx);
    expect(approveSlot(getPl(SID), "summary.parent_input", ctx, TODAY)).toBe(true);
  });
  it("changes the basis when evidence changes", () => {
    const s = addScore({});
    const a = basisOf(slotEvidence(getPl(SID), "plaafp.reading_literacy"));
    saveScore(getPl(SID), { ...s, descriptor: "Average" }, ctx);
    confirmEvidence(getPl(SID), s.id, ctx, TODAY);
    expect(basisOf(slotEvidence(getPl(SID), "plaafp.reading_literacy"))).not.toBe(a);
  });
});
