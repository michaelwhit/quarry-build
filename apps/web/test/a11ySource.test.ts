import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A cheap guard over the screen source: patterns that break keyboard or screen reader use.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}
const root = new URL("../src", import.meta.url).pathname;
const sources = files(root).map((p) => ({
  p: p.slice(root.length + 1),
  s: readFileSync(p, "utf8"),
}));
const line = (s: string, i: number) => s.slice(0, i).split("\n").length;

function find(re: RegExp): string[] {
  const out: string[] = [];
  for (const { p, s } of sources)
    for (const m of s.matchAll(re)) out.push(`${p}:${line(s, m.index ?? 0)}`);
  return out;
}

describe("screen source guard", () => {
  it("reads the screens", () => {
    expect(sources.length).toBeGreaterThan(10);
  });
  it("has no click handler on a div or span (use a button or link)", () => {
    expect(find(/<(div|span)\b[^>]*\bonClick/g)).toEqual([]);
  });
  it("has no positive tabIndex", () => {
    expect(find(/tabIndex=\{?"?[1-9]/g)).toEqual([]);
  });
  it("has no image without alt text", () => {
    const bad = find(/<img\b(?![^>]*\balt=)[^>]*>/g);
    expect(bad).toEqual([]);
  });
  it("has no text box, menu or text area without an id, a name or a wrapping label", () => {
    const bad: string[] = [];
    for (const { p, s } of sources)
      for (const m of s.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
        const attrs = m[2] ?? "";
        if (/type="(hidden|radio|checkbox|file)"/.test(attrs)) continue;
        if (/aria-label|aria-labelledby|\bid=/.test(attrs)) continue;
        const before = s.slice(0, m.index ?? 0);
        if (before.lastIndexOf("<label") > before.lastIndexOf("</label>")) continue;
        bad.push(`${p}:${line(s, m.index ?? 0)}`);
      }
    expect(bad).toEqual([]);
  });
});
