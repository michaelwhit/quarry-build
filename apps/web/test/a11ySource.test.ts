import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// A cheap guard over the screen source: patterns that break keyboard or screen reader use.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}
const root = fileURLToPath(new URL("../src", import.meta.url));
const sources = files(root).map((p) => ({
  p: p.slice(root.length + 1),
  s: readFileSync(p, "utf8"),
}));
const line = (s: string, i: number) => s.slice(0, i).split("\n").length;

interface Tag {
  name: string;
  attrs: string;
  where: string;
  before: string;
}

/** Every opening tag of the given names. The scan skips {...} and quoted values, so an arrow `=>` inside a prop does not end the tag. */
function tags(names: string[]): Tag[] {
  const out: Tag[] = [];
  const start = new RegExp(`<(${names.join("|")})(?=[\\s/>])`, "g");
  for (const { p, s } of sources) {
    for (const m of s.matchAll(start)) {
      let i = (m.index ?? 0) + m[0].length;
      let depth = 0;
      let quote = "";
      for (; i < s.length; i++) {
        const c = s[i]!;
        if (quote) {
          if (c === quote) quote = "";
        } else if (depth === 0 && (c === '"' || c === "'")) quote = c;
        else if (c === "{") depth++;
        else if (c === "}") depth--;
        else if (c === ">" && depth === 0) break;
      }
      const from = (m.index ?? 0) + m[0].length;
      out.push({
        name: m[1] ?? "",
        attrs: s.slice(from, i),
        where: `${p}:${line(s, m.index ?? 0)}`,
        before: s.slice(0, m.index ?? 0),
      });
    }
  }
  return out;
}

describe("screen source guard", () => {
  it("reads the screens and finds their tags", () => {
    expect(sources.length).toBeGreaterThan(10);
    expect(tags(["input", "button"]).length).toBeGreaterThan(10);
  });
  it("reads a tag whose props contain an arrow function", () => {
    // The scanner must not stop at the `>` of `=>`; check it on a known shape in the screens.
    const withArrow = tags(["input", "select", "textarea"]).filter((t) => t.attrs.includes("=>"));
    expect(withArrow.length).toBeGreaterThan(0);
  });
  it("has no click handler on a div or span (use a button or link)", () => {
    const bad = tags(["div", "span"]).filter((t) => /\bonClick\b/.test(t.attrs));
    expect(bad.map((t) => t.where)).toEqual([]);
  });
  it("has no positive tabIndex", () => {
    const bad = tags(["div", "span", "section", "details", "a", "button", "input"]).filter((t) =>
      /\btabIndex=\{?"?[1-9]/.test(t.attrs),
    );
    expect(bad.map((t) => t.where)).toEqual([]);
  });
  it("has no image without alt text", () => {
    const bad = tags(["img"]).filter((t) => !/(^|\s)alt=/.test(t.attrs));
    expect(bad.map((t) => t.where)).toEqual([]);
  });
  it("has no text box, menu or text area without an id, an aria name or a wrapping label", () => {
    const bad = tags(["input", "select", "textarea"]).filter((t) => {
      if (/type="(hidden|radio|checkbox|file)"/.test(t.attrs)) return false;
      if (/(^|\s)(aria-label|aria-labelledby|id)=/.test(t.attrs)) return false;
      return !(
        t.before.search(/<label[\s>](?![\s\S]*<label[\s>])/) > t.before.lastIndexOf("</label>")
      );
    });
    expect(bad.map((t) => t.where)).toEqual([]);
  });
});
