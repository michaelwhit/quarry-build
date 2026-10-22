import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { setRole } from "../src/data/roles.ts";
import { students } from "../src/data/district.ts";
import { loadSample } from "../src/data/workspace.ts";
import {
  SECTION_ORDER,
  buildPacket,
  canMark,
  getPacket,
  markCopied,
  resetPacketForTests,
  sectionState,
  setMarked,
  usePacketStorage,
} from "../src/data/srsPacket.ts";
import { SrsPacket, canUsePacket } from "../src/ui/SrsPacket.tsx";

setRole("sped_director");
loadSample();

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
const sid = () => students[0]!.student.id;
const section = (id: string) => buildPacket(sid()).find((s) => s.id === id)!;

beforeEach(() => {
  loadSample();
  usePacketStorage(mem());
  resetPacketForTests();
});

describe("IEP for SRS", () => {
  it("lists every section once, in the fixed order", () => {
    const ids = buildPacket(sid()).map((s) => s.id);
    expect(ids).toEqual(SECTION_ORDER.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("builds goal items from the student's goals with no last name", () => {
    const g = section("goals");
    expect(g.items.length).toBeGreaterThanOrEqual(students[0]!.goals.length * 2);
    expect(g.items.every((i) => !i.text?.includes(students[0]!.student.last_name))).toBe(true);
  });

  it("sections not built yet cannot be marked", () => {
    const t = section("services");
    expect(t.built).toBe(false);
    expect(canMark(getPacket(sid()), t)).toBe(false);
    expect(setMarked(sid(), t, true, "Ms. A")).toBe(false);
  });

  it("marking needs every item copied; a change unticks the section", () => {
    const g = section("goals");
    expect(canMark(getPacket(sid()), g)).toBe(false);
    for (const i of g.items) markCopied(sid(), i);
    expect(setMarked(sid(), section("goals"), true, "Ms. A")).toBe(true);
    expect(sectionState(getPacket(sid()), section("goals"))).toBe("pasted");
    const changed = { ...section("goals") };
    changed.items = changed.items.map((i, n) => (n === 0 ? { ...i, text: "new text" } : i));
    expect(sectionState(getPacket(sid()), changed)).toBe("changed");
  });

  it("unapproved present-levels slots are blocked, not pasted", () => {
    const p = section("plaafp");
    expect(p.items.every((i) => i.text === undefined && i.blocked)).toBe(true);
  });

  it("keeps no copied text in storage", () => {
    const store = mem();
    usePacketStorage(store);
    const g = section("goals");
    markCopied(sid(), g.items[0]!);
    const raw = store.getItem("goalline-practice-srs-v1") ?? "";
    expect(raw).not.toContain(g.items[0]!.text!);
  });

  it("renders for the director and refuses other roles", () => {
    expect(canUsePacket("sped_director")).toBe(true);
    expect(canUsePacket("paraprofessional")).toBe(false);
    const html = renderToString(createElement(SrsPacket, { studentId: sid() }));
    expect(html).toContain("IEP for SRS");
    expect(html.replaceAll("<!-- -->", "")).toContain("0 of 11 sections marked pasted");
    expect(html).not.toMatch(/accepted|filed/i);
  });
});
