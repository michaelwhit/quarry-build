import { beforeEach, describe, expect, it } from "vitest";
import { draftPwn } from "../src/data/pwn.ts";
import {
  PWN_KEY,
  approveBox,
  getPwnEntry,
  isApproved,
  resetPwnForTests,
  setPwnEntry,
  usePwnStorage,
} from "../src/data/pwnStore.ts";

function memory(initial?: string) {
  const m = new Map<string, string>(initial ? [[PWN_KEY, initial]] : []);
  return {
    m,
    s: {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    },
  };
}

const draftFor = (contactName: string) =>
  draftPwn({
    noteDate: "2027-01-05",
    rows: [],
    goals: [{ area: "Reading fluency", change: "added" }],
    considerations: [],
    esy: { choice: "needed" },
    alternatives: [],
    evaluations: ["Oral reading probe"],
    otherFactors: [],
    reasons: ["Daily practice is needed."],
    contact: { name: contactName, role: "Case manager" },
    helpSource: "The state parent help line",
  });

beforeEach(() => {
  usePwnStorage(null);
  resetPwnForTests();
});

describe("pwnStore", () => {
  it("saves entries and reads them back from storage", () => {
    const { m, s } = memory();
    usePwnStorage(s);
    setPwnEntry("s1", { noteDate: "2027-01-05", reasons: ["a", "b"] });
    expect(getPwnEntry("s1").reasons).toEqual(["a", "b"]);
    usePwnStorage(memory(m.get(PWN_KEY)).s);
    expect(getPwnEntry("s1").noteDate).toBe("2027-01-05");
  });

  it("starts empty on damaged storage and drops malformed fields", () => {
    usePwnStorage(memory("not json").s);
    expect(getPwnEntry("s1").reasons).toEqual([]);
    usePwnStorage(
      memory(
        JSON.stringify({
          s1: {
            reasons: [1, "ok"],
            alternatives: [5, { option: "x", reason: "y" }],
            approved: { contact: 7 },
          },
        }),
      ).s,
    );
    const e = getPwnEntry("s1");
    expect(e.reasons).toEqual(["", "ok"]);
    expect(e.alternatives).toEqual([{ option: "x", reason: "y" }]);
    expect(e.approved).toEqual({});
  });

  it("keeps the help source and drops a non-text one from damaged storage", () => {
    usePwnStorage(memory(JSON.stringify({ s1: { helpSource: 5 } })).s);
    expect(getPwnEntry("s1").helpSource).toBe("");
    setPwnEntry("s1", { helpSource: "The state parent help line" });
    expect(getPwnEntry("s1").helpSource).toBe("The state parent help line");
  });

  it("approves a ready box and refuses a blocked one", () => {
    expect(approveBox("s1", draftFor("Pat Example"), "contact")).toBe(true);
    expect(isApproved(getPwnEntry("s1"), draftFor("Pat Example"), "contact")).toBe(true);
    expect(approveBox("s1", draftFor(""), "contact")).toBe(false);
  });

  it("loses the approval when the text changes or the entries are edited", () => {
    approveBox("s1", draftFor("Pat Example"), "contact");
    expect(isApproved(getPwnEntry("s1"), draftFor("Sam Example"), "contact")).toBe(false);
    setPwnEntry("s1", { deliveryMethod: "Mailed" });
    expect(isApproved(getPwnEntry("s1"), draftFor("Pat Example"), "contact")).toBe(false);
  });

  it("never stores the draft text, only a fingerprint", () => {
    const { m, s } = memory();
    usePwnStorage(s);
    approveBox("s1", draftFor("Pat Example"), "contact");
    expect(m.get(PWN_KEY)).not.toContain("Pat Example");
  });
});
