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
  return exact.has(path) || prefixes.some((p) => path.startsWith(p));
}

describe("in-app links on the help pages go to real screens", () => {
  it("reads a sensible route list from App", () => {
    expect(exact.has("#/help")).toBe(true);
    expect(exact.has("#/accessibility")).toBe(true);
    expect(prefixes.length).toBeGreaterThan(0);
  });
  const pages: Array<[string, () => string]> = [
    ["Help", () => renderToString(createElement(Help))],
    ["Accessibility", () => renderToString(createElement(Accessibility))],
    ["FirstRunTour", () => renderToString(createElement(FirstRunTour))],
    ["More", () => renderToString(createElement(More))],
  ];
  for (const [name, render] of pages) {
    it(`${name}: every #/ link resolves`, () => {
      setRole("case_manager");
      const found = links(render());
      setRole(null);
      for (const l of found) expect(resolves(l), `${name} links to ${l}`).toBe(true);
    });
  }
});
