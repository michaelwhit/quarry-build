import { beforeEach, describe, expect, it } from "vitest";
import { setRole } from "../src/data/roles.ts";
import { students } from "../src/data/district.ts";
import { loadSample } from "../src/data/workspace.ts";
import {
  PLACEMENT_KEY,
  getPlacement,
  resetPlacementForTests,
  setPlacement,
  usePlacementStorage,
} from "../src/data/placement.ts";
import { PE_CONFIRM, items as healthPeItems } from "../src/data/srs/health_pe.ts";
import { items as lreItems } from "../src/data/srs/lre.ts";
import { items as transportationItems } from "../src/data/srs/transportation.ts";
import { buildPacket, canMark, getPacket, markCopied } from "../src/data/srsPacket.ts";

setRole("sped_director");

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
const sid = () => students[0]!.student.id;

beforeEach(() => {
  loadSample();
  usePlacementStorage(mem());
  resetPlacementForTests();
});

describe("placement, health and transportation", () => {
  it("blocks empty boxes and the unanswered transportation question", () => {
    expect(lreItems(sid())[0]!.blocked).toBeDefined();
    expect(healthPeItems(sid()).filter((i) => i.blocked)).toHaveLength(2);
    expect(transportationItems(sid())[0]!.blocked).toBeDefined();
  });

  it("copies written boxes and shows the Physical Education tick as a pick item", () => {
    setPlacement(sid(), {
      lre: "  General classroom with pull-out  ",
      health: "Daily snack",
      pe: "Full",
    });
    expect(lreItems(sid())[0]!.text).toBe("General classroom with pull-out");
    const items = healthPeItems(sid());
    expect(items.map((i) => i.text ?? i.pick)).toEqual([
      "Daily snack",
      "Full",
      `Tick in SRS: ${PE_CONFIRM}`,
    ]);
  });

  it("scrubs the last name from copied text", () => {
    const { student } = students[0]!;
    setPlacement(sid(), { lre: `${student.first_name} ${student.last_name} learns in class` });
    expect(lreItems(sid())[0]!.text).not.toContain(student.last_name);
  });

  it("shows the chosen transportation value as a pick item", () => {
    setPlacement(sid(), { transport: "no" });
    expect(transportationItems(sid())[0]).toMatchObject({ pick: "No" });
    expect(transportationItems(sid())[0]!.blocked).toBeUndefined();
  });

  it("registers the three sections as built, and marking waits for the boxes", () => {
    const secs = buildPacket(sid());
    for (const id of ["lre", "health_pe", "transportation"])
      expect(secs.find((s) => s.id === id)!.built).toBe(true);
    const lre = () => buildPacket(sid()).find((s) => s.id === "lre")!;
    expect(canMark(getPacket(sid()), lre())).toBe(false);
    setPlacement(sid(), { lre: "Resource room part of the day" });
    markCopied(sid(), lre().items[0]!);
    expect(canMark(getPacket(sid()), lre())).toBe(true);
  });

  it("keeps only valid saved data", () => {
    const s = mem();
    s.setItem(
      PLACEMENT_KEY,
      JSON.stringify({ [sid()]: { lre: 5, health: "ok", pe: "x", transport: "maybe" } }),
    );
    usePlacementStorage(s);
    expect(getPlacement(sid())).toEqual({ lre: "", health: "ok", pe: "x", transport: null });
  });
});
