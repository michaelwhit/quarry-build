import { beforeEach, describe, expect, it } from "vitest";
import { setRole } from "../src/data/roles.ts";
import { students } from "../src/data/district.ts";
import { loadSample } from "../src/data/workspace.ts";
import {
  GOAL_EXTRAS_KEY,
  PARENT_REPORTS,
  SCHEDULES,
  getGoalExtras,
  resetGoalExtrasForTests,
  updateGoalExtras,
  useGoalExtrasStorage,
} from "../src/data/goalExtras.ts";
import {
  buildPacket,
  canMark,
  getPacket,
  markCopied,
  resetPacketForTests,
  usePacketStorage,
} from "../src/data/srsPacket.ts";

setRole("sped_director");

const store = () => {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
const sid = () => students[0]!.student.id;
const goalId = () => students[0]!.goals[0]!.goal.id;
const goals = () => buildPacket(sid()).find((s) => s.id === "goals")!;
const item = (suffix: string) => goals().items.find((i) => i.id === `${goalId()}.${suffix}`)!;
let mem = store();

beforeEach(() => {
  loadSample();
  usePacketStorage(store());
  resetPacketForTests();
  mem = store();
  useGoalExtrasStorage(mem);
  resetGoalExtrasForTests();
});

describe("goal progress report boxes", () => {
  it("blocks schedule, person responsible and parent report until filled", () => {
    expect(item("schedule").blocked).toBeDefined();
    expect(item("responsible").blocked).toBeDefined();
    expect(item("parent").blocked).toBeDefined();
    expect(canMark(getPacket(sid()), goals())).toBe(false);
  });

  it("shows choices as picks and copies the typed boxes", () => {
    updateGoalExtras(goalId(), () => ({
      objectives: ["Reads 20 words.", "", "Reads 40 words."],
      schedule: SCHEDULES[1],
      instruments: "Sight word list.",
      responsible: "Case manager",
      parentReport: PARENT_REPORTS[0],
    }));
    expect(item("schedule").pick).toBe("Every 9 weeks");
    expect(item("parent").pick).toBe(PARENT_REPORTS[0]);
    expect(item("responsible").text).toBe("Case manager");
    expect(item("objective1").text).toBe("Reads 20 words.");
    expect(item("objective2").text).toBe("Reads 40 words.");
    expect(item("objective3")).toBeUndefined();
    expect(item("measure").text).toMatch(/^Sight word list\. Target /);
    for (const i of goals().items.filter((x) => x.id.startsWith(goalId()))) markCopied(sid(), i);
  });

  it("removes the student's last name from copied boxes", () => {
    const last = students[0]!.student.last_name;
    updateGoalExtras(goalId(), (r) => ({
      ...r,
      objectives: [`${last} reads 20 words.`],
      responsible: `Teacher for ${last}`,
    }));
    expect(item("objective1").text).not.toContain(last);
    expect(item("responsible").text).not.toContain(last);
  });

  it("saves under its own key and ignores bad stored data", () => {
    updateGoalExtras(goalId(), (r) => ({ ...r, schedule: "Annually" }));
    expect(JSON.parse(mem.m.get(GOAL_EXTRAS_KEY)!)[goalId()].schedule).toBe("Annually");
    const bad = store();
    bad.m.set(
      GOAL_EXTRAS_KEY,
      JSON.stringify({ [goalId()]: { schedule: "Whenever", objectives: "x", parentReport: 4 } }),
    );
    useGoalExtrasStorage(bad);
    expect(getGoalExtras(goalId()).schedule).toBe("");
    expect(getGoalExtras(goalId()).objectives).toEqual([]);
    bad.m.set(GOAL_EXTRAS_KEY, "{nope");
    useGoalExtrasStorage(bad);
    expect(getGoalExtras(goalId()).parentReport).toBe("");
  });
});
