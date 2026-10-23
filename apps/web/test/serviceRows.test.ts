import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { setRole } from "../src/data/roles.ts";
import { students } from "../src/data/district.ts";
import { loadSample } from "../src/data/workspace.ts";
import { buildPacket, canMark, getPacket, markCopied, setMarked } from "../src/data/srsPacket.ts";
import { usePacketStorage, resetPacketForTests } from "../src/data/srsPacket.ts";
import {
  SERVICES_KEY,
  type RowDraft,
  addServiceRow,
  removeServiceRow,
  resetServicesForTests,
  rowProblem,
  useServicesStorage,
} from "../src/data/serviceRows.ts";
import { accommodations } from "../src/data/library.ts";
import { SrsPacket } from "../src/ui/SrsPacket.tsx";

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
const sec = () => buildPacket(sid()).find((s) => s.id === "services")!;
const good: RowDraft = {
  kind: "special_education",
  title: "Reading instruction",
  start: "2026-09-01",
  end: "",
  frequency: "22 days/semester",
  duration: "15 min/day",
  location: "Resource room",
  followsCalendar: true,
};

beforeEach(() => {
  loadSample();
  usePacketStorage(mem());
  resetPacketForTests();
  useServicesStorage(mem());
  resetServicesForTests();
});

describe("services and supports rows", () => {
  it("is empty until a row is added", () => {
    expect(sec().built).toBe(true);
    expect(sec().items).toEqual([]);
  });

  it("blocks vague, empty and out-of-order rows", () => {
    expect(rowProblem(good)).toBeUndefined();
    expect(rowProblem({ ...good, frequency: "As needed" })).toMatch(/not "as needed"/);
    expect(rowProblem({ ...good, frequency: "" })).toBeDefined();
    expect(rowProblem({ ...good, frequency: "often" })).toBeDefined();
    expect(rowProblem({ ...good, frequency: "On timed work" })).toBeUndefined();
    expect(rowProblem({ ...good, location: " " })).toBeDefined();
    expect(rowProblem({ ...good, end: "2026-08-01" })).toBeDefined();
  });

  it("a blocked row blocks the section; a complete row copies cell by cell", () => {
    addServiceRow(sid(), { ...good, frequency: "as needed" });
    expect(sec().items.every((i) => i.blocked && i.text === undefined)).toBe(true);
    expect(canMark(getPacket(sid()), sec())).toBe(false);
    removeServiceRow(sid(), "sv1");
    addServiceRow(sid(), good);
    const items = sec().items;
    expect(items.map((i) => i.label)).toEqual([
      "Special education service 1: service",
      "Special education service 1: start and end dates",
      "Special education service 1: Frequency",
      "Special education service 1: Duration",
      "Special education service 1: Location",
      "Special education service 1: follows school calendar",
    ]);
    expect(items[1]!.text).toBe("09/01/2026");
    expect(items[5]!.pick).toBe("Yes");
    for (const i of items) markCopied(sid(), i);
    expect(setMarked(sid(), sec(), true, "Ms. A")).toBe(true);
  });

  it("changing a row after marking flips the section to changed", () => {
    addServiceRow(sid(), good);
    for (const i of sec().items) markCopied(sid(), i);
    setMarked(sid(), sec(), true, "Ms. A");
    addServiceRow(sid(), { ...good, kind: "accommodation", title: accommodations[0]!.title });
    expect(canMark(getPacket(sid()), sec())).toBe(false);
  });

  it("numbers labels within each kind", () => {
    addServiceRow(sid(), good);
    addServiceRow(sid(), { ...good, kind: "accommodation", title: "Extra time" });
    addServiceRow(sid(), { ...good, kind: "accommodation", title: "Quiet space" });
    const labels = sec().items.map((i) => i.label);
    expect(labels).toContain("Special education service 1: service");
    expect(labels).toContain("Accommodation 1: service");
    expect(labels).toContain("Accommodation 2: service");
    expect(labels.some((l) => l.startsWith("Accommodation 3"))).toBe(false);
  });

  it("keeps no last name in copy text", () => {
    const last = students[0]!.student.last_name;
    addServiceRow(sid(), { ...good, title: `Reading with ${last}` });
    expect(sec().items.every((i) => !i.text?.includes(last))).toBe(true);
  });

  it("stores rows under its own key and renders the form", () => {
    const store = mem();
    useServicesStorage(store);
    addServiceRow(sid(), good);
    expect(store.getItem(SERVICES_KEY)).toContain("Reading instruction");
    const html = renderToString(createElement(SrsPacket, { studentId: sid() }));
    expect(html).toContain("Add from the accommodation library");
    expect(html).toContain("Frequency");
  });
});

describe("Services page", () => {
  it("shows the form for the director and refuses other roles", async () => {
    const { Services, canUseServices } = await import("../src/ui/Services.tsx");
    expect(canUseServices("sped_director")).toBe(true);
    expect(canUseServices("paraprofessional")).toBe(false);
    const html = renderToString(createElement(Services, { studentId: sid() }));
    expect(html).toContain("Add from the accommodation library");
    expect(renderToString(createElement(Services, { studentId: "nobody" }))).toContain(
      "Student not found",
    );
  });
});
