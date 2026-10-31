import { createElement } from "react";
import { renderToReadableStream, renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Home } from "../src/ui/Home.tsx";
import { AccessReview, StaffList } from "../src/ui/StaffList.tsx";
import { can, setRole } from "../src/data/roles.ts";
import { clearAll, loadSample, useStorage } from "../src/data/workspace.ts";
import {
  accessCsv,
  ROLE_LINES,
  accessRoster,
  filterStaff,
  roleName,
  staffRows,
  type StaffPerson,
} from "../src/data/staffList.ts";

const TODAY = "2026-10-21";

beforeEach(() => {
  useStorage(null);
  setRole("sped_director");
  clearAll();
  loadSample();
});

describe("staff list", () => {
  it("lists active staff, director first, with building and counts", () => {
    const rows = staffRows(TODAY);
    expect(rows[0]?.role).toBe("sped_director");
    expect(rows[0]?.position).toBe("District office");
    expect(rows.map((r) => r.role)).toEqual([
      "sped_director",
      "case_manager",
      "case_manager",
      "related_service_provider",
      "paraprofessional",
      "gen_ed_teacher",
    ]);
    const cm = rows.find((r) => r.role === "case_manager");
    expect(cm?.detail).toMatch(/^\d+ students?$/);
    const para = rows.find((r) => r.role === "paraprofessional");
    expect(para?.detail).toMatch(/^\d+ delegated goals?/);
  });

  it("shows a status word and a role end date on each row, and keeps a paused person off the access list", () => {
    const people: StaffPerson[] = [
      { id: "s1", display_name: "Sam Example", role: "case_manager", status: "active" },
      {
        id: "s2",
        display_name: "Riley Mockridge",
        role: "paraprofessional",
        status: "paused",
        role_end_date: "2027-06-01",
      },
      { id: "s3", display_name: "Gone Person", role: "case_manager", status: "removed" },
    ];
    const rows = staffRows(TODAY, people);
    expect(rows.map((r) => [r.name, r.status, r.roleEnds])).toEqual([
      ["Sam Example", "active", ""],
      ["Riley Mockridge", "paused", "Role ends Jun 2027"],
    ]);
    expect(accessRoster(TODAY, people).map((r) => r.name)).toEqual(["Sam Example"]);
    expect(staffRows(TODAY).every((r) => r.status === "active" && r.roleEnds === "")).toBe(true);
  });

  it("searches by name and filters by role", () => {
    const rows = staffRows(TODAY);
    expect(filterStaff(rows, "case_managers", "").every((r) => r.role === "case_manager")).toBe(
      true,
    );
    expect(filterStaff(rows, "providers", "")).toHaveLength(1);
    expect(filterStaff(rows, "paras", "")).toHaveLength(1);
    expect(filterStaff(rows, "all", "  MORGAN ")).toHaveLength(1);
    expect(filterStaff(rows, "all", "zzz")).toEqual([]);
  });

  it("names roles in plain words", () => {
    expect(roleName("related_service_provider")).toBe("SLP / psych");
    expect(roleName("paraprofessional")).toBe("Para");
    expect(roleName("gen_ed_teacher")).toBe("General-education teacher");
  });
});

describe("role lines", () => {
  it("say gen-ed teachers only see a read-only At a glance", () => {
    expect(ROLE_LINES.gen_ed_teacher).toBe(
      "Sees a read-only At a glance for the goals a case manager gives them.",
    );
    expect(ROLE_LINES.gen_ed_teacher).not.toMatch(/record/i);
  });
});

describe("who can see student records", () => {
  it("makes a quoted CSV and guards cells that start like formulas", () => {
    const csv = accessCsv([
      { id: "a", name: 'Ann "A" Lee', position: "Prairie Wind Elementary", role: "Case manager" },
      { id: "b", name: "=cmd", position: "+1", role: "@x" },
    ]);
    expect(csv).toBe(
      [
        "Name,Position,Role",
        '"Ann ""A"" Lee","Prairie Wind Elementary","Case manager"',
        `"'=cmd","'+1","'@x"`,
        "",
      ].join("\n"),
    );
  });

  it("gives every row its own id, even when two people share a name", () => {
    const ids = accessRoster(TODAY).map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has a row per active staff member and a header-only CSV for nobody", () => {
    expect(accessRoster(TODAY)).toHaveLength(6);
    expect(accessCsv([])).toBe("Name,Position,Role\n");
  });
});

describe("staff screens and access", () => {
  it("are for the director only", () => {
    expect(can("sped_director", "staffRoles")).toBe(true);
    for (const r of [
      "case_manager",
      "related_service_provider",
      "paraprofessional",
      "gen_ed_teacher",
    ] as const)
      expect(can(r, "staffRoles")).toBe(false);
  });

  it("show Home tiles only to the director", () => {
    expect(renderToString(createElement(Home))).toContain('href="#/staff"');
    expect(renderToString(createElement(Home))).toContain('href="#/access-review"');
    setRole("case_manager");
    expect(renderToString(createElement(Home))).not.toContain('href="#/staff"');
    expect(renderToString(createElement(Home))).not.toContain("#/access-review");
  });

  it("shows the sign-up approval panel only in a build with a sign-in server address", async () => {
    // The panel is chosen when the screen's module loads, so each build setting gets a fresh load.
    const render = async (origin: string) => {
      vi.stubEnv("VITE_GOALLINE_API_ORIGIN", origin);
      vi.resetModules();
      const { StaffList: Fresh } = await import("../src/ui/StaffList.tsx");
      const stream = await renderToReadableStream(createElement(Fresh));
      await stream.allReady;
      return new Response(stream).text();
    };
    try {
      const practice = await render("");
      expect(practice).toContain("Staff and roles");
      expect(practice).not.toContain("Invite a new staff member");
      const served = await render("https://api.example.test");
      expect(served).toContain("Staff and roles");
      expect(served).toContain("Invite a new staff member");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("render with the read-only note and the CSV button", () => {
    const list = renderToString(createElement(StaffList));
    expect(list).toContain("Staff and roles");
    expect(list).toContain("Search staff");
    expect(list).toContain("Export who can see student records");
    expect(list.replaceAll("<!-- -->", "")).toContain("Status: Active");
    expect(list).not.toContain("Access is paused.");
    expect(list.replaceAll("<!-- -->", "")).toMatch(/role="status">\d+ (people|person) shown/);
    const review = renderToString(createElement(AccessReview));
    expect(review).toContain("Who can see student records");
    expect(review).toContain("Save as CSV");
  });
  it("says so and explains the off Save button when no one can see student records", () => {
    const html = renderToString(createElement(AccessReview, { rows: [] }));
    expect(html).toContain("No one is listed as able to see student records.");
    expect(html).toContain("Nothing to save until someone is listed.");
    const button = /<button[^>]*>/.exec(html)![0];
    expect(button).toContain('aria-describedby="csv-off"');
    expect(button).toContain("disabled");
    const full = renderToString(createElement(AccessReview));
    expect(full).not.toContain("csv-off");
  });
});
