import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Accessibility } from "../src/ui/Accessibility.tsx";
import { Help } from "../src/ui/Help.tsx";
import { FirstRunTour } from "../src/ui/FirstRunTour.tsx";

function levels(html: string): number[] {
  return [...html.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
}
function emptyControls(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<(a|button)\b[^>]*>(.*?)<\/\1>/gs)) {
    const text = (m[2] ?? "").replace(/<[^>]*>/g, "").trim();
    if (!text && !/aria-label="[^"]+"/.test(m[0])) out.push(m[0]);
  }
  return out;
}

describe("Help, Accessibility and the tour read well with a screen reader", () => {
  const pages: Array<[string, string]> = [
    ["Help", renderToString(createElement(Help))],
    ["Accessibility", renderToString(createElement(Accessibility))],
    ["FirstRunTour", renderToString(createElement(FirstRunTour))],
  ];
  for (const [name, html] of pages) {
    it(`${name}: headings never skip a level and the page adds no h1`, () => {
      const ls = levels(html);
      expect(ls.length).toBeGreaterThan(0);
      // The app shell (App.tsx) holds the only h1; these screens start at h2.
      expect(ls.filter((l) => l === 1).length).toBeLessThanOrEqual(0);
      for (let i = 1; i < ls.length; i++) expect(ls[i]! - ls[i - 1]!).toBeLessThanOrEqual(1);
    });
    it(`${name}: no link or button without a name`, () => {
      expect(emptyControls(html)).toEqual([]);
    });
    it(`${name}: no image without alt text`, () => {
      for (const m of html.matchAll(/<img\b[^>]*>/g)) expect(m[0]).toMatch(/\balt="/);
    });
  }
});
