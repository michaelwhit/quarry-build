import { beforeEach, describe, expect, it } from "vitest";
import { setRole } from "../src/data/roles.ts";
import { students } from "../src/data/district.ts";
import { loadSample } from "../src/data/workspace.ts";
import {
  BOXES,
  NOT_NEEDED,
  considerationText,
  getConsiderations,
  resetConsiderationsForTests,
  setConsideration,
  useConsiderationStorage,
} from "../src/data/considerations.ts";
import {
  SECTION_ORDER,
  buildPacket,
  canMark,
  getPacket,
  markCopied,
  resetPacketForTests,
  usePacketStorage,
} from "../src/data/srsPacket.ts";
import {
  approveSlot,
  getPl,
  resetPlForTests,
  setSlotText,
  usePlStorage,
} from "../src/data/presentLevels.ts";

setRole("sped_director");

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
const sid = () => students[0]!.student.id;
const section = (id: string) => buildPacket(sid()).find((s) => s.id === id)!;
const ctx = { who: "Ms. A", now: new Date("2026-10-21T15:00:00Z") };

beforeEach(() => {
  loadSample();
  usePacketStorage(mem());
  resetPacketForTests();
  useConsiderationStorage(mem());
  resetConsiderationsForTests();
  usePlStorage(mem());
  resetPlForTests();
});

describe("SRS order and consideration boxes", () => {
  it("follows the SRS order", () => {
    expect(SECTION_ORDER.map((s) => s.id).slice(0, 4)).toEqual([
      "header",
      "attendance",
      "considerations",
      "plaafp",
    ]);
    expect(SECTION_ORDER.at(-1)?.id).toBe("pwn");
  });

  it("a box needs a choice; not needed pastes the standard sentence, plus a reason", () => {
    expect(considerationText(undefined)).toHaveProperty("blocked");
    expect(considerationText({ choice: "not_needed", text: "" })).toEqual({ text: NOT_NEEDED });
    expect(considerationText({ choice: "not_needed", text: "No concerns." })).toEqual({
      text: `${NOT_NEEDED} No concerns.`,
    });
    expect(considerationText({ choice: "needed", text: " " })).toHaveProperty("blocked");
  });

  it("the section is blocked until every box is answered and every slot approved", () => {
    expect(canMark(getPacket(sid()), section("considerations"))).toBe(false);
    for (const b of BOXES) setConsideration(sid(), b.id, { choice: "not_needed", text: "" });
    const sec = section("considerations");
    // the four present-level slots are still unwritten
    expect(sec.items.filter((i) => i.blocked)).toHaveLength(4);
    expect(sec.items.filter((i) => i.text === NOT_NEEDED)).toHaveLength(BOXES.length);
  });

  it("keeps the choice across reloads and ignores unreadable storage", () => {
    const store = mem();
    useConsiderationStorage(store);
    setConsideration(sid(), "at", { choice: "needed", text: "Speech device" });
    useConsiderationStorage(store);
    expect(getConsiderations(sid())["at"]?.text).toBe("Speech device");
    store.setItem("goalline-practice-considerations-v1", "{not json");
    useConsiderationStorage(store);
    expect(getConsiderations(sid())).toEqual({});
  });
});

describe("whole present levels copy", () => {
  const write = (key: string, text: string, approve: boolean) => {
    setSlotText(getPl(sid()), key, text, ctx);
    if (approve) approveSlot(getPl(sid()), key, ctx, "2026-10-21");
  };

  it("joins the approved areas in order, and per-area copies do not block marking", () => {
    write("plaafp.reading_literacy", "Reads at a first-grade level.", true);
    write("plaafp.math", "Adds within 10.", true);
    const sec = section("plaafp");
    const whole = sec.items.find((i) => i.id === "plaafp.whole")!;
    expect(whole.text).toContain("Reads at a first-grade level.");
    expect(whole.text!.indexOf("Reads")).toBeLessThan(whole.text!.indexOf("Adds"));
    expect(sec.items.filter((i) => i.optional)).toHaveLength(2);
    markCopied(sid(), whole);
    expect(canMark(getPacket(sid()), section("plaafp"))).toBe(true);
  });

  it("is blocked while a written area is not approved", () => {
    write("plaafp.reading_literacy", "Reads at a first-grade level.", true);
    write("plaafp.math", "Adds within 10.", false);
    const whole = section("plaafp").items.find((i) => i.id === "plaafp.whole")!;
    expect(whole.text).toBeUndefined();
    expect(whole.blocked).toBeTruthy();
  });
});

describe("goals", () => {
  it("writes the baseline inside the annual goal", () => {
    const first = section("goals").items[0]!;
    expect(first.label).toContain("measurable annual goal");
    expect(first.text).toContain(" Baseline: ");
    expect(section("goals").items.some((i) => i.label.endsWith("baseline"))).toBe(false);
  });
});
