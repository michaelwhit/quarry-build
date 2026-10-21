import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import {
  REPORTS,
  auditRows,
  canSeeOverdue,
  clearOverdue,
  homeLine,
  overdueCount,
  overdueList,
  recordListLoad,
  setPracticeDate,
  viewDate,
} from "../src/data/overdue.ts";
import { ROLES, setRole } from "../src/data/roles.ts";
import { Overdue, OverdueHomeLine } from "../src/ui/Overdue.tsx";

beforeEach(() => {
  setRole("sped_director");
  clearOverdue();
});

describe("which reports are waiting", () => {
  it("has the 12 first-quarter reports, 6 of them filed", () => {
    expect(REPORTS).toHaveLength(12);
    expect(
      REPORTS.filter((r) => r.state.startsWith("filed") || r.state.startsWith("verified")),
    ).toHaveLength(6);
  });

  it("is quiet until the first school day after the due date", () => {
    expect(overdueCount("2026-10-23")).toBe(0);
    expect(overdueCount("2026-10-25")).toBe(0);
    expect(overdueCount("2026-10-26")).toBe(6);
  });

  it("shows the same 6 on the phone-demo day and after the Nov 9 staff day", () => {
    expect(overdueCount("2026-10-30")).toBe(6);
    expect(overdueCount("2026-11-16")).toBe(6);
  });

  it("matches the Home number to the list total, whichever period is picked", () => {
    const all = overdueList("2026-10-30");
    expect(all.total).toBe(overdueCount("2026-10-30"));
    const first = all.periods[0];
    expect(overdueList("2026-10-30", first?.id).total).toBe(6);
    expect(overdueList("2026-10-30", "Quarter 9").total).toBe(0);
  });

  it("groups by building, then case manager, and the counts add up", () => {
    const list = overdueList("2026-10-30");
    const counted = list.buildings.reduce(
      (n, b) => n + b.managers.reduce((m, g) => m + g.reports.length, 0),
      0,
    );
    expect(counted).toBe(list.total);
    expect(list.buildings.map((b) => b.building)).toEqual(
      [...list.buildings.map((b) => b.building)].sort(),
    );
  });

  it("lists only unfiled reports, in plain words, oldest due date first", () => {
    const rows = overdueList("2026-10-30").buildings.flatMap((b) =>
      b.managers.flatMap((m) => m.reports),
    );
    expect(rows.every((r) => r.words !== "")).toBe(true);
    expect(new Set(rows.map((r) => r.words))).toEqual(
      new Set([
        "Not started",
        "Draft saved",
        "Approved, ready to copy",
        "Copied, not yet marked filed",
      ]),
    );
    for (const b of overdueList("2026-10-30").buildings)
      for (const m of b.managers) {
        const due = m.reports.map((r) => r.dueDate);
        expect(due).toEqual([...due].sort());
      }
  });

  it("shows a student by first name and last initial only", () => {
    for (const r of REPORTS) expect(r.student).toMatch(/^\S+ [A-Z]\.$/);
  });

  it("has a calm empty state and Home line", () => {
    expect(homeLine("2026-10-20")).toBe("No progress reports overdue");
    expect(homeLine("2026-10-30")).toBe("6 progress reports overdue");
  });
});

describe("who can open it", () => {
  it("is for the director only", () => {
    for (const role of ROLES) expect(canSeeOverdue(role.id)).toBe(role.id === "sped_director");
    expect(canSeeOverdue(null)).toBe(false);
  });
});

describe("the page", () => {
  it("never says late, and has no export, print, share or send control", () => {
    setPracticeDate("2026-10-30");
    const html = renderToString(createElement(Overdue)).replaceAll("<!-- -->", "");
    expect(html).toContain("Progress reports to file");
    expect(html).toContain("6 waiting past their due date");
    expect(html).toContain("Ask the case manager: ");
    expect(html.match(/Ask the case manager: /g)).toHaveLength(
      overdueList("2026-10-30").buildings.flatMap((b) => b.managers).length,
    );
    expect(html).not.toContain("<button");
    expect(html.toLowerCase()).not.toMatch(/\blate\b|export|print|share|email|send|\bai\b/);
  });

  it("shows the empty wording when nothing is waiting", () => {
    setPracticeDate("2026-10-20");
    expect(renderToString(createElement(Overdue))).toContain(
      "Nothing is waiting. Every progress report due so far is filed.",
    );
    expect(renderToString(createElement(OverdueHomeLine)).replaceAll("<!-- -->", "")).toContain(
      "No progress reports overdue",
    );
  });
});

describe("what the view keeps", () => {
  it("writes one audit row per list load, with counts and ids only", () => {
    const list = overdueList("2026-10-30");
    recordListLoad(list);
    expect(auditRows).toHaveLength(1);
    expect(Object.keys(auditRows[0] ?? {}).sort()).toEqual(["action", "count", "reportIds"]);
    expect(auditRows[0]?.count).toBe(6);
    expect(JSON.stringify(auditRows)).not.toMatch(/Fernsworth|Pebbleford|Calla|Rowan/);
  });

  it("clears the pretend date and audit rows when the role changes or the person signs out", () => {
    setPracticeDate("2026-11-16");
    recordListLoad(overdueList("2026-11-16"));
    setRole("case_manager");
    expect(auditRows).toHaveLength(0);
    expect(viewDate()).not.toBe("2026-11-16");
    setRole("sped_director");
    setPracticeDate("2026-11-16");
    setRole(null);
    expect(viewDate()).not.toBe("2026-11-16");
  });
});
