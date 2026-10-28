import { beforeEach, describe, expect, it } from "vitest";
import { setRole } from "../src/data/roles.ts";
import { students } from "../src/data/district.ts";
import { loadSample } from "../src/data/workspace.ts";
import {
  PERIODS,
  approve,
  attest,
  dataChanged,
  reopen,
  defaultComment,
  defaultPeriod,
  openingPeriod,
  editGoal,
  effectiveSufficient,
  getRecord,
  goalKit,
  markCopied,
  needsReason,
  resetReportsForTests,
  useReportStorage,
} from "../src/data/reports.ts";

setRole("sped_director");
loadSample();

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
const ctx = { who: "Practice Case Manager", hash: "abc12345" };
const q1 = PERIODS[0]!;
const sv = () => students[0]!;

beforeEach(() => {
  useReportStorage(mem());
  resetReportsForTests();
});

describe("period and numbers", () => {
  it("defaults to the period due next", () => {
    expect(defaultPeriod(new Date("2026-10-21T12:00:00Z")).id).toBe("q1");
    // due day itself still counts as due (local time)
    expect(defaultPeriod(new Date(2026, 9, 23, 22, 30)).id).toBe("q1");
    expect(defaultPeriod(new Date(2026, 9, 24, 0, 5)).id).toBe("q2");
    expect(defaultPeriod(new Date("2026-11-01T12:00:00Z")).id).toBe("q2");
    expect(defaultPeriod(new Date("2027-06-01T12:00:00Z")).id).toBe("q2");
  });
  it("a student's page opens on a past-due unfiled period, else the one due next (a default, the picker lists all)", () => {
    expect(openingPeriod("s1", new Date(2026, 9, 30)).id).toBe("q1");
    expect(openingPeriod("s1", new Date(2026, 9, 22)).id).toBe("q1");
    // Quarter 1 is still unfiled in January, so it stays the one that opens.
    expect(openingPeriod("s1", new Date(2027, 0, 5)).id).toBe("q1");
  });
  it("counts only data inside the period and never says Yes without data", () => {
    const q2 = PERIODS[1]!;
    for (const g of sv().goals) {
      const k1 = goalKit(g, q1);
      expect(k1.sessions).toBeGreaterThan(0);
      expect(defaultComment(sv().student, g, k1)).toContain(sv().student.first_name);
      const k2 = goalKit(g, q2);
      expect(k2.sessions).toBe(0);
      expect(k2.computed).toBeNull();
      expect(effectiveSufficient({ sufficient: true }, k2)).toBe(false);
      expect(defaultComment(sv().student, g, k2)).toBe("");
    }
  });
  it("needs a reason only when the answer differs from the numbers", () => {
    const k = goalKit(sv().goals[0]!, q1);
    const same = k.computed === true;
    expect(needsReason({ sufficient: same }, k)).toBe(false);
    expect(needsReason({ sufficient: !same }, k)).toBe(true);
    expect(needsReason(undefined, k)).toBe(false);
  });
});

describe("steps and the filing log", () => {
  const ids = ["g1", "g2"];
  const both = ["comment", "yesNo"] as const;
  const frozen = [{ goalId: "g1", sufficient: true, comment: "approved text" }];
  const go = (rec: ReturnType<typeof getRecord>) => getRecord(rec.studentId, rec.periodId);

  it("walks draft, approve, copy each goal, then attest, one log row per step", () => {
    const sid = sv().student.id;
    editGoal(getRecord(sid, "q1"), "g1", { comment: "x" }, ctx);
    expect(getRecord(sid, "q1").state).toBe("drafted");
    approve(getRecord(sid, "q1"), frozen, ctx);
    markCopied(getRecord(sid, "q1"), "g1", 1, ids, "comment", both, ctx);
    expect(getRecord(sid, "q1").goals["g1"]?.copied).toBeFalsy();
    markCopied(getRecord(sid, "q1"), "g1", 1, ids, "yesNo", both, ctx);
    expect(getRecord(sid, "q1").state).toBe("approved");
    attest(getRecord(sid, "q1"), ctx);
    expect(getRecord(sid, "q1").state).toBe("approved");
    markCopied(getRecord(sid, "q1"), "g2", 2, ids, "yesNo", ["yesNo"], ctx);
    expect(getRecord(sid, "q1").state).toBe("copied");
    attest(getRecord(sid, "q1"), ctx);
    const r = getRecord(sid, "q1");
    expect(r.state).toBe("filed_attested");
    expect(r.log.map((l) => l.text)).toEqual([
      "Draft saved",
      "Approved",
      "Copied goal 1",
      "Copied goal 2",
      "All goals copied",
      "Attested as filed in SRS",
    ]);
    expect(r.log.every((l) => l.who === ctx.who && l.hash === ctx.hash)).toBe(true);
    expect(go(r)).toBe(r);
  });

  it("refuses edits after approval and copies before approval", () => {
    const sid = sv().student.id;
    markCopied(getRecord(sid, "q1"), "g1", 1, ids, "yesNo", both, ctx);
    expect(getRecord(sid, "q1").log).toEqual([]);
    approve(getRecord(sid, "q1"), frozen, ctx);
    editGoal(getRecord(sid, "q1"), "g1", { comment: "late" }, ctx);
    expect(getRecord(sid, "q1").goals["g1"]?.comment).toBeUndefined();
  });

  it("freezes what was approved and flags later data changes until reopened", () => {
    const sid = sv().student.id;
    editGoal(getRecord(sid, "q1"), "g1", { comment: "x" }, ctx);
    approve(getRecord(sid, "q1"), frozen, ctx);
    const r = getRecord(sid, "q1");
    expect(r.goals["g1"]?.frozen).toEqual({ sufficient: true, comment: "approved text" });
    expect(r.approvedHash).toBe(ctx.hash);
    expect(dataChanged(r, ctx.hash)).toBe(false);
    expect(dataChanged(r, "ffffffff")).toBe(true);
    markCopied(r, "g1", 1, ids, "yesNo", ["yesNo"], ctx);
    reopen(getRecord(sid, "q1"), ctx);
    const after = getRecord(sid, "q1");
    expect(after.state).toBe("drafted");
    expect(after.goals["g1"]?.frozen).toBeUndefined();
    expect(after.goals["g1"]?.copied).toBeUndefined();
    expect(after.goals["g1"]?.comment).toBe("x");
    expect(after.log.map((l) => l.text).slice(-2)).toEqual([
      "Copied goal 1",
      "Reopened to update from new data",
    ]);
    attest(after, ctx);
    expect(getRecord(sid, "q1").state).toBe("drafted");
  });

  it("stamps later log rows with the approved hash", () => {
    const sid = sv().student.id;
    const live = { who: ctx.who, hash: "live0001" };
    editGoal(getRecord(sid, "q1"), "g1", { comment: "x" }, live);
    approve(getRecord(sid, "q1"), frozen, live);
    const approved = getRecord(sid, "q1").approvedHash ?? live.hash;
    expect(approved).toBe("live0001");
    // the screen passes rec.approvedHash ?? liveHash once approved
    const after = { who: ctx.who, hash: approved };
    markCopied(getRecord(sid, "q1"), "g1", 1, ["g1"], "yesNo", ["yesNo"], after);
    attest(getRecord(sid, "q1"), after);
    expect(
      getRecord(sid, "q1")
        .log.slice(1)
        .every((l) => l.hash === "live0001"),
    ).toBe(true);
  });

  it("does not reopen a filed report", () => {
    const sid = sv().student.id;
    editGoal(getRecord(sid, "q1"), "g1", { comment: "x" }, ctx);
    approve(getRecord(sid, "q1"), frozen, ctx);
    markCopied(getRecord(sid, "q1"), "g1", 1, ["g1"], "yesNo", ["yesNo"], ctx);
    attest(getRecord(sid, "q1"), ctx);
    reopen(getRecord(sid, "q1"), ctx);
    expect(getRecord(sid, "q1").state).toBe("filed_attested");
  });

  it("keeps records across a reload and ignores unreadable storage", () => {
    const store = mem();
    useReportStorage(store);
    const sid = sv().student.id;
    editGoal(getRecord(sid, "q1"), "g1", { comment: "kept" }, ctx);
    useReportStorage(store);
    expect(getRecord(sid, "q1").goals["g1"]?.comment).toBe("kept");
    store.setItem("goalline-practice-reports-v1", "{not json");
    useReportStorage(store);
    expect(getRecord(sid, "q1").state).toBe("not_started");
  });
});

describe("copied text", () => {
  it("never carries the last name", async () => {
    const { scrub } = await import("../src/data/district.ts");
    const st = sv().student;
    expect(scrub(`${st.first_name} ${st.last_name} did well.`, st)).not.toContain(st.last_name);
  });
});
