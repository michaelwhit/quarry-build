import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { setRole } from "../src/data/roles.ts";
import { students } from "../src/data/district.ts";
import { loadSample, useStorage } from "../src/data/workspace.ts";
import { viewDate } from "../src/data/overdue.ts";
import {
  SERVICE_LOG_KEY,
  deleteEntry,
  getServiceLog,
  logEntry,
  resetServiceLogForTests,
  setRequiredPerWeek,
  useServiceLogStorage,
} from "../src/data/serviceLogStore.ts";
import { ServiceLog, canUseServiceLog } from "../src/ui/ServiceLog.tsx";

const mem = () => {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
const sid = () => students[0]!.student.id;
let store = mem();

beforeEach(() => {
  useStorage(null);
  setRole("sped_director");
  loadSample();
  store = mem();
  useServiceLogStorage(store);
  resetServiceLogForTests();
});

describe("service log store", () => {
  it("adds entries with fresh ids, refuses bad ones and removes by id", () => {
    expect(logEntry(sid(), { date: "2026-10-19", minutes: 30, outcome: "delivered" })).toBeNull();
    expect(
      logEntry(sid(), { date: "2026-10-20", minutes: 30, outcome: "provider_absent" }),
    ).toBeNull();
    expect(logEntry(sid(), { date: "2026-02-30", minutes: 30, outcome: "delivered" })).toBe(
      "Pick a real date.",
    );
    expect(logEntry(sid(), { date: "2026-10-21", minutes: 0, outcome: "delivered" })).toMatch(
      /Minutes/,
    );
    const ids = getServiceLog(sid()).entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
    deleteEntry(sid(), ids[0]!);
    expect(getServiceLog(sid()).entries).toHaveLength(1);
  });

  it("keeps the weekly minutes to a sane whole number", () => {
    setRequiredPerWeek(sid(), 90);
    expect(getServiceLog(sid()).requiredPerWeek).toBe(90);
    setRequiredPerWeek(sid(), 999999);
    expect(getServiceLog(sid()).requiredPerWeek).toBe(90);
    setRequiredPerWeek(sid(), 1.5);
    expect(getServiceLog(sid()).requiredPerWeek).toBe(90);
    setRequiredPerWeek(sid(), 0);
    expect(getServiceLog(sid()).requiredPerWeek).toBe(0);
  });

  it("saves under its own key and drops bad stored entries", () => {
    setRequiredPerWeek(sid(), 60);
    expect(JSON.parse(store.m.get(SERVICE_LOG_KEY)!)[sid()].requiredPerWeek).toBe(60);
    const bad = mem();
    bad.m.set(
      SERVICE_LOG_KEY,
      JSON.stringify({
        [sid()]: {
          requiredPerWeek: "x",
          entries: [
            { id: "e1", date: "2026-10-19", minutes: 30, outcome: "delivered" },
            { id: "e2", date: "nope", minutes: 30, outcome: "delivered" },
            { id: "e3", date: "2026-10-19", minutes: 30, outcome: "teleported" },
            "junk",
          ],
        },
      }),
    );
    useServiceLogStorage(bad);
    const log = getServiceLog(sid());
    expect(log.requiredPerWeek).toBe(0);
    expect(log.entries.map((e) => e.id)).toEqual(["e1"]);
    bad.m.set(SERVICE_LOG_KEY, "{nope");
    useServiceLogStorage(bad);
    expect(getServiceLog(sid()).entries).toEqual([]);
  });
});

describe("service log screen", () => {
  const draw = () =>
    renderToString(createElement(ServiceLog, { studentId: sid() })).replaceAll("<!-- -->", "");

  it("starts empty with the form", () => {
    const html = draw();
    expect(html).toContain("Service minutes log");
    expect(html).toContain("No entries yet.");
    expect(html).toContain("Add to log");
    expect(html).toContain("Practice data only");
  });

  it("shows the week line once there are entries", () => {
    setRequiredPerWeek(sid(), 90);
    logEntry(sid(), { date: viewDate(), minutes: 60, outcome: "delivered" });
    const html = draw();
    expect(html).toContain("Delivered 60 of 90 minutes; 30 short, none owed in make-up.");
    expect(html).toContain("Remove ");
  });

  it("is limited to staff roles", () => {
    expect(canUseServiceLog("paraprofessional")).toBe(false);
    setRole("paraprofessional");
    expect(draw()).toContain("Not available for this role");
    expect(renderToString(createElement(ServiceLog, { studentId: "nobody" }))).toContain(
      "Not available",
    );
  });
});
