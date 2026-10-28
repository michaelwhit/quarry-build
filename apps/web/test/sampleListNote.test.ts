import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { students } from "../src/data/district.ts";
import { setRole } from "../src/data/roles.ts";
import { loadSample } from "../src/data/workspace.ts";
import { SampleListNote } from "../src/ui/Overdue.tsx";

setRole("sped_director");
const html = () => renderToString(createElement(SampleListNote));

describe("SampleListNote", () => {
  it("says the lists are demo samples while no students are loaded, then goes away", () => {
    expect(students.length).toBe(0);
    expect(html()).toContain("samples from the demo district");
    expect(html()).toContain('href="#/"');
    loadSample();
    expect(students.length).toBeGreaterThan(0);
    expect(html()).toBe("");
  });
});
