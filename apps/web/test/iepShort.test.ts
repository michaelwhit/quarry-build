import { beforeEach, describe, expect, it } from "vitest";
import { setRole } from "../src/data/roles.ts";
import { students } from "../src/data/district.ts";
import { loadSample } from "../src/data/workspace.ts";
import {
  IEP_SHORT_KEY,
  addAttendee,
  getIepShort,
  parseDate,
  resetIepShortForTests,
  reviewDate,
  updateIepShort,
  useIepShortStorage,
  usDate,
} from "../src/data/iepShort.ts";
import { ESY_NOT_NEEDED } from "../src/data/srs/esy.ts";
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
const section = (id: string) => buildPacket(sid()).find((s) => s.id === id)!;
let mem = store();

beforeEach(() => {
  loadSample();
  usePacketStorage(store());
  resetPacketForTests();
  mem = store();
  useIepShortStorage(mem);
  resetIepShortForTests();
});

describe("dates", () => {
  it("review date is the day before the first anniversary", () => {
    expect(reviewDate("2026-10-22")).toBe("2027-10-21");
    expect(reviewDate("2026-01-01")).toBe("2026-12-31");
    expect(reviewDate("2027-03-01")).toBe("2028-02-29");
    expect(reviewDate("2028-02-29")).toBe("2029-02-27");
    expect(reviewDate("nope")).toBe("");
  });
  it("rejects impossible dates and formats for SRS", () => {
    expect(parseDate("2026-02-30")).toBeNull();
    expect(usDate("2026-10-05")).toBe("10/05/2026");
  });
});

describe("header", () => {
  it("is blocked until filled, then copies dates and takes the grade from the student", () => {
    expect(section("header").built).toBe(true);
    expect(section("header").items.some((i) => i.blocked)).toBe(true);
    updateIepShort(sid(), (r) => ({
      ...r,
      effective: "2026-10-22",
      meeting: "2026-10-20",
      school: "Elm Hill Elementary",
    }));
    const h = section("header");
    expect(h.items.map((i) => i.text)).toEqual([
      "10/22/2026",
      "10/21/2027",
      "10/20/2026",
      "Elm Hill Elementary",
      students[0]!.student.grade,
    ]);
  });
});

describe("attendance", () => {
  it("copies name, position and date; shows position and attended as picks", () => {
    updateIepShort(sid(), (r) => ({ ...r, meeting: "2026-10-20" }));
    addAttendee(sid());
    addAttendee(sid());
    updateIepShort(sid(), (r) => ({
      ...r,
      attendees: r.attendees.map((a) => ({ ...a, name: "Pat Example", position: "Parent" })),
      parent: ["yes", "yes", "no"],
    }));
    const a = section("attendance");
    expect(a.items[0]!.text).toBe("Pat Example, Parent, 10/20/2026");
    expect(a.items[0]!.pick).toBe("position Parent; attended Yes");
    expect(a.items[1]!.id).not.toBe(a.items[0]!.id);
    expect(a.items.filter((i) => i.blocked)).toHaveLength(0);
    expect(a.items[4]!.pick).toContain("No");
  });
  it("blocks missing name, position, date and unanswered parent questions", () => {
    addAttendee(sid());
    const a = section("attendance");
    expect(a.items.filter((i) => i.blocked)).toHaveLength(4);
    expect(canMark(getPacket(sid()), a)).toBe(false);
  });
  it("a person can appear twice and marking waits for both copies", () => {
    addAttendee(sid());
    addAttendee(sid());
    updateIepShort(sid(), (r) => ({
      ...r,
      attendees: [
        { ...r.attendees[0]!, name: "Sam Example", position: "Other", date: "2026-10-20" },
        { ...r.attendees[1]!, name: "Sam Example", position: "Parent", date: "2026-10-20" },
      ],
      parent: ["yes", "yes", "yes"],
    }));
    const a = section("attendance");
    expect(a.items[0]!.id).not.toBe(a.items[1]!.id);
    expect(a.items[0]!.text).toBe("Sam Example, Other, 10/20/2026");
    expect(a.items[1]!.text).toBe("Sam Example, Parent, 10/20/2026");
    expect(canMark(getPacket(sid()), a)).toBe(false);
    markCopied(sid(), a.items[0]!);
    expect(canMark(getPacket(sid()), section("attendance"))).toBe(false);
    markCopied(sid(), a.items[1]!);
    expect(canMark(getPacket(sid()), section("attendance"))).toBe(true);
  });
});

describe("alternate assessment", () => {
  it("needs an explanation only when the answer is No", () => {
    expect(section("alt_assessment").items[0]!.blocked).toBeDefined();
    updateIepShort(sid(), (r) => ({ ...r, altRequired: "yes" }));
    expect(section("alt_assessment").items.some((i) => i.blocked)).toBe(false);
    updateIepShort(sid(), (r) => ({ ...r, altRequired: "no" }));
    expect(section("alt_assessment").items[1]!.blocked).toBeDefined();
    updateIepShort(sid(), (r) => ({ ...r, altWhy: "Takes the alternate version." }));
    expect(section("alt_assessment").items[1]!.text).toBe("Takes the alternate version.");
  });
});

describe("extended school year", () => {
  it("uses the standard sentence for not needed and the teacher's words for needed", () => {
    expect(section("esy").items[0]!.blocked).toBeDefined();
    updateIepShort(sid(), (r) => ({ ...r, esy: { choice: "not_needed", text: "" } }));
    expect(section("esy").items[0]!.text).toBe(ESY_NOT_NEEDED);
    updateIepShort(sid(), (r) => ({ ...r, esy: { choice: "needed", text: "" } }));
    expect(section("esy").items[0]!.blocked).toBeDefined();
    updateIepShort(sid(), (r) => ({ ...r, esy: { choice: "needed", text: "Summer sessions." } }));
    expect(section("esy").items[0]!.text).toBe("Summer sessions.");
  });
});

describe("privacy and storage", () => {
  it("removes the student's last name from copied text", () => {
    const last = students[0]!.student.last_name;
    updateIepShort(sid(), (r) => ({ ...r, school: `${last} Elementary` }));
    expect(section("header").items[3]!.text).not.toContain(last);
    updateIepShort(sid(), (r) => ({
      ...r,
      esy: { choice: "needed", text: `Summer for ${last}.` },
    }));
    expect(section("esy").items[0]!.text).not.toContain(last);
  });
  it("saves under its own key and ignores bad stored data", () => {
    updateIepShort(sid(), (r) => ({ ...r, school: "Elm Hill" }));
    expect(JSON.parse(mem.m.get(IEP_SHORT_KEY)!)[sid()].school).toBe("Elm Hill");
    const bad = store();
    bad.m.set(
      IEP_SHORT_KEY,
      JSON.stringify({ [sid()]: { effective: "2026-02-30", parent: [1], attendees: "x" } }),
    );
    useIepShortStorage(bad);
    expect(getIepShort(sid()).effective).toBe("");
    bad.m.set(IEP_SHORT_KEY, "{not json");
    useIepShortStorage(bad);
    expect(getIepShort(sid()).attendees).toEqual([]);
  });
});
