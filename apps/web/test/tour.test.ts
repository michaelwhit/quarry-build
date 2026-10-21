import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = new URL("../public/tour/", import.meta.url);
const read = (f: string) => readFileSync(new URL(f, dir), "utf8");

describe("public tour page", () => {
  const html = read("index.html").replace(/\s+/g, " ");
  const js = read("tour.js");

  it("is a static, no-index page with no form, storage, network call or third-party request", () => {
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).not.toMatch(/<form|<input|<iframe/i);
    expect(html).not.toMatch(/(?:src|href)\s*=\s*["']https?:/i);
    expect(js).not.toMatch(
      /fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|document\.cookie/,
    );
    expect(html).toContain("script-src 'self'");
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
  });

  it("carries the preview lines, the Planned label and no claims or names", () => {
    expect(html).toContain("Preview with practice data. Not for real students.");
    expect(html).toContain("Not affiliated with any school district or state agency.");
    expect(html).toContain("Contact details coming soon.");
    expect(html).toContain("In this preview, each person sees only their part.");
    expect(html).toContain("Planned");
    const text = html.replace(/<[^>]+>/g, " ");
    // Terms are built from pieces so the list itself never spells a banned name out.
    const banned = [
      "FERPA",
      "secure",
      "complian",
      "certified",
      "approved",
      "S" + "RS",
      "ES" + "UCC",
      "Goal" + "book",
      "Tool" + "kit",
    ];
    for (const term of banned) expect(text.toLowerCase()).not.toContain(term.toLowerCase());
  });

  it("has images with no embedded metadata", () => {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".png")) continue;
      const b = readFileSync(new URL(f, dir));
      const chunks: string[] = [];
      for (let i = 8; i < b.length; i += 12 + b.readUInt32BE(i))
        chunks.push(b.toString("latin1", i + 4, i + 8));
      expect(chunks.filter((c) => !["IHDR", "IDAT", "IEND", "PLTE", "tRNS"].includes(c))).toEqual(
        [],
      );
    }
    expect(read("goal-bank-preview.svg")).not.toMatch(/<metadata|c2pa|xmp/i);
  });

  it("pairs the slogan with the not-affiliated line wherever it appears", () => {
    const flat = html.replace(/\s+/g, " ");
    const slogan = '<p class="slogan">Made by SPED staff for SPED staff</p>';
    const pair = `${slogan} <p class="note">Not affiliated with any school district or state agency.</p>`;
    expect(flat.split(slogan)).toHaveLength(3);
    expect(flat.split(pair)).toHaveLength(3);
  });
});
