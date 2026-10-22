import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import {
  REPORTS,
  auditRows,
  canSeeOverdue,
  clearOverdue,
  homeLine,
  isoToday,
  overdueCount,
  overdueList,
  recordListLoad,
  setPracticeDate,
  viewDate,
} from "../src/data/overdue.ts";
import { ROLES, setRole } from "../src/data/roles.ts";
import {
  approve,
  attest,
  getRecord,
  markCopied,
  resetReportsForTests,
  useReportStorage,
} from "../src/data/reports.ts";
import { Overdue, OverdueHomeLine, dueWords, sharedDueDate } from "../src/ui/Overdue.tsx";

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

describe("today's date", () => {
  it("is the local date, even late in the evening", () => {
    // 9:30 pm local on Friday Oct 23: the UTC date is already Saturday, but the local day is Friday.
    const lateEvening = new Date(2026, 9, 23, 21, 30);
    expect(isoToday(lateEvening)).toBe("2026-10-23");
    expect(overdueCount(isoToday(lateEvening))).toBe(0);
    // Just after midnight local on Monday Oct 26.
    expect(isoToday(new Date(2026, 9, 26, 0, 5))).toBe("2026-10-26");
    expect(isoToday(new Date(2027, 0, 5, 23, 59))).toBe("2027-01-05");
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

  it("names the due date in the summary only when every waiting report shares it", () => {
    setPracticeDate("2026-10-30");
    const html = renderToString(createElement(Overdue)).replaceAll("<!-- -->", "");
    expect(html).toContain("6 waiting past their due date · Quarter 1 report, due Oct 23");
    expect(sharedDueDate(["2026-10-23", "2026-10-23"])).toBe("2026-10-23");
    expect(sharedDueDate(["2026-10-23", "2026-10-30"])).toBeUndefined();
    expect(sharedDueDate([])).toBeUndefined();
  });

  it("writes dates from the text, so the day never moves", () => {
    expect(dueWords("2026-10-23")).toBe("Oct 23");
    expect(dueWords("2027-01-05")).toBe("Jan 5");
    expect(dueWords("2026-12-31")).toBe("Dec 31");
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

describe("reports worked on in the paste kit", () => {
  const ctx = { who: "Practice Director", hash: "abc12345" };
  beforeEach(() => {
    useReportStorage({ getItem: () => null, setItem: () => undefined });
    resetReportsForTests();
  });

  it("leave the waiting list once attested, and show the kit's state while in progress", () => {
    const today = "2026-10-30";
    const before = overdueList(today);
    const first = before.buildings[0]!.managers[0]!.reports[0]!;
    const q = first.period.replace("Quarter ", "q");

    approve(getRecord(first.studentId, q), [], ctx);
    const approved = overdueList(today)
      .buildings.flatMap((b) => b.managers.flatMap((m) => m.reports))
      .find((r) => r.id === first.id);
    expect(approved?.words).toBe("Approved, ready to copy");
    expect(overdueCount(today)).toBe(before.total);

    markCopied(getRecord(first.studentId, q), "g", 1, ["g"], "yesNo", ["yesNo"], ctx);
    attest(getRecord(first.studentId, q), ctx);
    expect(overdueCount(today)).toBe(before.total - 1);
    expect(
      overdueList(today)
        .buildings.flatMap((b) => b.managers.flatMap((m) => m.reports))
        .some((r) => r.id === first.id),
    ).toBe(false);
  });
});
