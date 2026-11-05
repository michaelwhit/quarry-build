import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { accommodations } from "../src/data/library.ts";
import { setRole } from "../src/data/roles.ts";
import { loadSample } from "../src/data/workspace.ts";
import { AccommodationBulk } from "../src/ui/AccommodationBulk.tsx";

setRole("sped_director");

const render = (picked: typeof accommodations) =>
  renderToString(createElement(AccommodationBulk, { picked, onDone: () => undefined }));

describe("AccommodationBulk screen", () => {
  beforeEach(() => {
    loadSample();
  });
  it("starts with the button off and says how to turn it on when nothing is ticked", () => {
    const html = render([]);
    expect(html).toContain("Tick one or more accommodations in the list to turn this on.");
    expect(html).toMatch(/<button[^>]*disabled/);
    expect(html).toContain('aria-describedby="bulk-hint"');
    expect(html).toContain("Add 0 ticked to the student");
  });
  it("asks for a student once something is ticked", () => {
    const html = render(accommodations.slice(0, 2));
    expect(html).toContain("Choose a student to turn this on.");
    expect(html).toContain("Add 2 ticked to the student");
    expect(html).toMatch(/<button[^>]*disabled/);
  });
  it("names the student picker and lists every student", () => {
    const html = render(accommodations.slice(0, 1));
    expect(html).toContain('aria-label="Student for the ticked accommodations"');
    expect(html).toContain("Choose a student");
    expect(html.match(/<option/g)!.length).toBeGreaterThan(1);
  });
  it("keeps a polite status area for the result", () => {
    expect(render([])).toContain('role="status"');
  });
});
