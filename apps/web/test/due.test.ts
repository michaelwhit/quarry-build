import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DATA_GAP_SCHOOL_DAYS,
  clearDue,
  dueAuditRows,
  dueView,
  recordDueLoad,
  schoolDaysSince,
  setSampleAnchor,
} from "../src/data/due.ts";
import { overdueList, setPracticeDate } from "../src/data/overdue.ts";
import { setRole } from "../src/data/roles.ts";
import { Due } from "../src/ui/Due.tsx";

beforeEach(() => {
  setRole("sped_director");
  clearDue();
  // Day one of the sample sessions: nothing is moved, so the dates below are fixed.
  setSampleAnchor("2026-10-16");
});
afterEach(() => setSampleAnchor(null));

const items = (v: ReturnType<typeof dueView>) =>
  v.managers.flatMap((m) => [...m.overdue, ...m.comingUp]);

describe("school days", () => {
  it("counts only school days after the start day, through the end day", () => {
    // Fri Oct 23, Sat, Sun, Mon Oct 26.
    expect(schoolDaysSince("2026-10-23", "2026-10-26")).toBe(1);
    expect(schoolDaysSince("2026-10-23", "2026-10-23")).toBe(0);
    expect(schoolDaysSince("2026-10-26", "2026-10-23")).toBe(0);
    // Nov 9 is a no-school day.
    expect(schoolDaysSince("2026-11-06", "2026-11-10")).toBe(1);
  });
});

describe("overdue reports", () => {
  it("lists the same reports as the overdue view, grouped by case manager", () => {
    const view = dueView("2026-10-30");
    const reports = view.managers.flatMap((m) => m.overdue).filter((i) => i.kind === "report");
    expect(reports).toHaveLength(overdueList("2026-10-30").total);
    expect(reports.every((r) => r.overdue)).toBe(true);
  });

  it("holds a report back until the first school day after its due date", () => {
    // Due Fri Oct 23: still coming up on the weekend, overdue on Monday.
    const weekend = dueView("2026-10-25");
    expect(items(weekend).filter((i) => i.kind === "report" && i.overdue)).toHaveLength(0);
    expect(items(weekend).filter((i) => i.kind === "report")).toHaveLength(6);
    expect(
      items(dueView("2026-10-26")).filter((i) => i.kind === "report" && i.overdue),
    ).toHaveLength(6);
  });
});

describe("IEP dates", () => {
  it("shows annual reviews and reevaluations inside the window, soonest first", () => {
    const wide = items(dueView("2026-10-30", 180)).filter((i) => i.kind !== "report");
    expect(wide.length).toBeGreaterThan(0);
    expect(wide.every((i) => i.dueDate <= "2027-04-28")).toBe(true);
    const narrow = items(dueView("2026-10-30", 30)).filter((i) => i.kind !== "report");
    expect(narrow).toHaveLength(0);
  });

  it("calls a passed date overdue and a future date coming up", () => {
    const v = dueView("2027-03-10", 30);
    const dates = v.managers
      .flatMap((m) => [...m.overdue, ...m.comingUp])
      .filter((i) => i.kind === "annual_review");
    expect(dates.some((i) => i.overdue && i.dueDate < "2027-03-10")).toBe(true);
    expect(dates.some((i) => !i.overdue && i.dueDate >= "2027-03-10")).toBe(true);
  });
});

describe("students who need data recorded", () => {
  it("lists nobody the day after the last recording", () => {
    // The demo's newest data is Thu Oct 15.
    expect(dueView("2026-10-16").managers.flatMap((m) => m.needsData)).toHaveLength(0);
  });

  it("lists students once a goal goes more than the gap without a data point", () => {
    expect(DATA_GAP_SCHOOL_DAYS).toBe(5);
    // Two goals last had data on Oct 13: their sixth school day without is Oct 21.
    expect(dueView("2026-10-20").managers.flatMap((m) => m.needsData)).toHaveLength(0);
    const partial = dueView("2026-10-21").managers.flatMap((m) => m.needsData);
    expect(partial).toHaveLength(2);
    expect(partial.every((g) => g.goalsWithoutData === 1)).toBe(true);
    // Everything else last had data on Oct 15: the sixth school day without is Oct 23.
    const gaps = dueView("2026-10-23").managers.flatMap((m) => m.needsData);
    expect(gaps).toHaveLength(12);
    for (const g of gaps) {
      expect(g.goalsWithoutData).toBeGreaterThan(0);
      expect(g.goalsWithoutData).toBeLessThanOrEqual(g.goalsTotal);
    }
  });
});

describe("sample sessions moved forward for a demo", () => {
  const gaps = (today: string, openedOn: string) =>
    dueView(today, 180, openedOn).managers.flatMap((m) => m.needsData);

  it("measures data to record from the moved sessions, so a demo day starts clear", () => {
    // Opened Oct 30: the newest session moves to Thu Oct 29, two weeks later.
    expect(gaps("2026-10-30", "2026-10-30")).toHaveLength(0);
    expect(gaps("2026-10-30", "2026-10-16")).toHaveLength(12);
    expect(gaps("2026-11-16", "2026-11-16")).toHaveLength(0);
    for (const g of gaps("2026-11-09", "2026-10-30")) expect(g.lastRecorded).toMatch(/^2026-10-/);
  });

  it("still shows gaps when the practice date moves forward", () => {
    // Two goals last recorded Oct 27 reach six school days without data on Nov 4. The rest, last
    // recorded Oct 29, reach it on Nov 6.
    expect(gaps("2026-11-03", "2026-10-30")).toHaveLength(0);
    expect(gaps("2026-11-04", "2026-10-30")).toHaveLength(2);
    expect(gaps("2026-11-06", "2026-10-30")).toHaveLength(12);
    expect(gaps("2026-11-06", "2026-10-30").map((g) => g.lastRecorded)).toContain("2026-10-29");
  });
});

describe("where a case manager works", () => {
  it("names every building the caseload is in, not just the first student's", () => {
    const managers = dueView("2026-10-30").managers;
    expect(managers.length).toBeGreaterThan(0);
    const want = ["Prairie Wind Elementary", "Sandhill Middle"];
    for (const m of managers) expect(m.buildings).toEqual(want);
  });
});

describe("plain words and no ranking", () => {
  it("uses first name and last initial, and orders case managers by name, not by count", () => {
    const v = dueView("2026-10-30");
    const names = v.managers.map((m) => m.caseManager);
    expect(names).toEqual([...names].sort());
    for (const i of items(v)) expect(i.student).toMatch(/^\S+ [A-Z]\.$/);
    expect(JSON.stringify(v).toLowerCase()).not.toMatch(/\blate\b|score|rank/);
  });

  it("counts every listed item in the total", () => {
    const v = dueView("2026-10-30");
    expect(v.total).toBe(
      v.managers.reduce((n, m) => n + m.overdue.length + m.comingUp.length + m.needsData.length, 0),
    );
  });
});

describe("what the view keeps", () => {
  it("writes one audit row per load with counts and ids only", () => {
    const v = dueView("2026-10-30");
    recordDueLoad(v);
    expect(dueAuditRows).toHaveLength(1);
    const row = dueAuditRows[0];
    expect(row?.count).toBe(v.total);
    expect(Object.keys(row ?? {}).sort()).toEqual(["action", "count", "itemIds", "studentIds"]);
    expect(JSON.stringify(row)).not.toMatch(/[A-Z][a-z]+ [A-Z]\./);
  });

  it("clears the audit rows when the role changes", () => {
    setRole("sped_director");
    recordDueLoad(dueView("2026-10-30"));
    expect(dueAuditRows).toHaveLength(1);
    setRole("case_manager");
    expect(dueAuditRows).toHaveLength(0);
  });
});

describe("the page", () => {
  const html = (date: string) => {
    setPracticeDate(date);
    return renderToString(createElement(Due)).replaceAll("<!-- -->", "");
  };

  it("shows one card per case manager with plain headings and counts", () => {
    const page = html("2026-10-30");
    expect(page).toContain("What&#x27;s due");
    expect(page).toContain("6 overdue");
    const managers = dueView("2026-10-30").managers;
    expect(page.match(/<section class="card"/g)).toHaveLength(managers.length);
    for (const m of managers) expect(page).toContain(m.caseManager);
    expect(page).toContain("Data to record");
    expect(page).toContain("last recorded Oct 15");
  });

  it("is read only: no button, export, print, share, send or AI words, and never late", () => {
    const page = html("2026-10-30");
    expect(page).not.toContain("<button");
    expect(page.toLowerCase()).not.toMatch(
      /\blate\b|\bbehind\b|export|print|share|email|send|\bai\b/,
    );
  });
});
