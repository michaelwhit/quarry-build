import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { students } from "../src/data/district.ts";
import { setRole } from "../src/data/roles.ts";
import { addServiceRow, resetServicesForTests } from "../src/data/serviceRows.ts";
import { clearAll, loadSample } from "../src/data/workspace.ts";
import { AtAGlance } from "../src/ui/Glance.tsx";

const page = (id: string) =>
  renderToString(createElement(AtAGlance, { studentId: id })).replaceAll("<!-- -->", "");

// The student list is built for the signed-in role; the director sees all twelve.
setRole("sped_director");

describe("a general-education teacher's At a glance", () => {
  beforeEach(() => {
    clearAll();
    resetServicesForTests();
    loadSample();
  });

  it("shows the student's accommodations, read only", () => {
    const html = page(students[0]?.student.id ?? "");
    expect(html).toContain("Accommodations and modifications");
    expect(html).not.toContain("Planned");
    expect(html).not.toContain("<button");
  });

  it("lists a service with its frequency and time, and says so when there is none", () => {
    const id = students[0]?.student.id ?? "";
    expect(page(id)).toContain("None recorded yet.");
    addServiceRow(id, {
      kind: "special_education",
      title: "Reading help",
      start: "2026-09-01",
      end: "",
      frequency: "3 days/week",
      duration: "30 min/day",
      location: "Resource room",
      followsCalendar: true,
    });
    const html = page(id);
    expect(html).toContain("Reading help");
    expect(html).toContain("Special education service · 3 days/week · 30 min/day");
    // The place is the team's to name; the teacher's page keeps to what and how much.
    expect(html).not.toContain("Resource room");
  });
});
