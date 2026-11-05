import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { setRole } from "../src/data/roles.ts";
import { Accessibility } from "../src/ui/Accessibility.tsx";
import { Help } from "../src/ui/Help.tsx";
import { FirstRunTour } from "../src/ui/FirstRunTour.tsx";
import { More } from "../src/ui/Home.tsx";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const exact = new Set([...app.matchAll(/hash === "(#\/[a-z-]+)"/g)].map((m) => m[1] ?? ""));
const prefixes = [...app.matchAll(/startsWith\("(#\/[a-z-]+)/g)].map((m) => m[1] ?? "");

function links(html: string): string[] {
  return [...html.matchAll(/href="(#\/[^"]*)"/g)].map((m) => m[1] ?? "");
}
function resolves(link: string): boolean {
  const path = link.split("?")[0] ?? link;
  return exact.has(path) || prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

describe("in-app links on the help pages go to real screens", () => {
  it("reads a sensible route list from App", () => {
    expect(exact.has("#/help")).toBe(true);
    expect(exact.has("#/accessibility")).toBe(true);
    expect(prefixes.length).toBeGreaterThan(0);
  });
  // Help itself has no in-app links; the other three must have at least one.
  const pages: Array<[string, () => string, boolean]> = [
    ["Help", () => renderToString(createElement(Help)), false],
    ["Accessibility", () => renderToString(createElement(Accessibility)), true],
    ["FirstRunTour", () => renderToString(createElement(FirstRunTour)), true],
    ["More", () => renderToString(createElement(More)), true],
  ];
  for (const [name, render, needsLinks] of pages) {
    it(`${name}: every #/ link resolves`, () => {
      let found: string[];
      setRole("case_manager");
      try {
        found = links(render());
      } finally {
        setRole(null);
      }
      if (needsLinks) expect(found.length).toBeGreaterThan(0);
      for (const l of found) expect(resolves(l), `${name} links to ${l}`).toBe(true);
    });
  }
});
