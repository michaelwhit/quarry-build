import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Behavior, SECTIONS, StudentNav, isSection } from "../src/ui/StudentSections.tsx";

const text = (html: string) => html.replaceAll("<!-- -->", "");

describe("student page sections", () => {
  it("lists the five sections in Kylie's order", () => {
    expect(SECTIONS.map((s) => s.label)).toEqual([
      "Goals",
      "Accommodations / modifications",
      "Present levels",
      "Services",
      "Behavior",
    ]);
  });

  it("knows which addresses are sections", () => {
    expect(isSection("behavior")).toBe(true);
    expect(isSection("edit")).toBe(false);
    expect(isSection(undefined)).toBe(false);
  });

  it("links each button to its address and marks the current one", () => {
    const html = text(
      renderToString(createElement(StudentNav, { studentId: "s1", active: "behavior" })),
    );
    expect(html).toContain('href="#/student/s1"');
    expect(html).toContain('href="#/student/s1/accommodations"');
    expect(html).toContain('href="#/student/s1/present-levels"');
    expect(html).toContain('href="#/student/s1/services"');
    expect(html).toContain('aria-current="page"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("keeps the BIP upload turned off and says why", () => {
    const html = text(renderToString(createElement(Behavior)));
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Upload a BIP<\/button>/);
    expect(html).toContain("waits for the security review");
    expect(html).not.toContain("secure");
  });
});
