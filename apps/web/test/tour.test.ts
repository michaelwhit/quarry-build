import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = new URL("../public/tour/", import.meta.url);
const read = (f: string) => readFileSync(new URL(f, dir), "utf8");

describe("public tour page", () => {
  const html = read("index.html").replace(/\s+/g, " ");
  const js = read("tour.js") + read("boot.js");

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
    expect(html).toContain("One tool for the whole special education team.");
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
    const pngs = readdirSync(new URL("img/", dir)).map((f) => `img/${f}`);
    expect(pngs.length).toBeGreaterThan(0);
    for (const f of pngs) {
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

  it("keeps every picture small enough for a quick page", () => {
    for (const f of readdirSync(new URL("img/", dir))) {
      const size = readFileSync(new URL(`img/${f}`, dir)).length;
      expect(size, f).toBeLessThan(250_000);
    }
  });

  it("shows the exact device line and the web-app label, and no store, date or system claims", () => {
    expect(html).toContain(
      "Today this is the web app, which runs in a web browser. Mac and iPhone apps are planned.",
    );
    const text = html.replace(/<[^>]+>/g, " ").toLowerCase();
    for (const word of [
      "app store",
      "download",
      "google play",
      "windows app",
      "android",
      "coming in",
    ])
      expect(text).not.toContain(word);
    // Every picture is labelled, and every picture file the page names exists in both colours.
    const labels = html.match(/Web app, practice data/g) ?? [];
    const figures = html.match(/<figure\s+class="shot/g) ?? [];
    expect(labels.length).toBe(figures.length - 3); // the three goal-bank drawings are labelled Preview
    for (const m of html.matchAll(/src="(img\/[^"]+)"/g)) read(m[1] as string);
  });

  it("has no inline style or script and no data: images", () => {
    expect(html).not.toMatch(/\sstyle\s*=|data:image/i);
  });

  it("keeps the page plain: one device list, no colour toggle, one footer, no slogan", () => {
    const flat = html.replace(/\s+/g, " ");
    expect(flat).toContain('<select id="device">');
    expect(html).not.toMatch(/data-theme=|>Light<|>Dark</);
    expect(html).not.toContain("Made by SPED staff");
    expect(flat.split("Preview with practice data. Not for real students.")).toHaveLength(2);
    expect(flat).toMatch(
      /<footer\s+class="foot">.*Preview with practice data.*Not affiliated.*<\/footer>/,
    );
    expect(html).not.toContain("Contact details");
    expect(flat).toContain(
      "Today this is the web app, which runs in a web browser. Mac and iPhone apps are planned.",
    );
    expect(js).not.toMatch(/localStorage|sessionStorage|document\.cookie|fetch\(|XMLHttpRequest/);
  });

  it("guides with labelled tap areas that always land on a prepared picture", () => {
    const css = read("hotspots.css");
    const panels = html.split(/<section\s+class="panel"/).slice(1);
    let hotspots = 0;
    for (const panel of panels) {
      const states = new Set([...panel.matchAll(/data-state="([^"]+)"/g)].map((m) => m[1]));
      for (const m of panel.matchAll(/<button\s+type="button"\s+class="hot ([^"]+)"([^>]*)>/g)) {
        hotspots++;
        const attrs = m[2] ?? "";
        expect(attrs).toMatch(/aria-label="[^"]+"/);
        const go = /data-go="([^"]+)"/.exec(attrs)?.[1];
        const say = /data-say="([^"]+)"/.exec(attrs)?.[1];
        expect(Boolean(go) !== Boolean(say)).toBe(true);
        if (go && go !== "next") expect(states.has(go), go).toBe(true);
        expect(css).toContain(`.${m[1]?.split(" ").at(-1)} {`);
      }
      if (panel.includes('class="hot')) expect(panel).toContain("Skip, show me the next screen");
    }
    expect(hotspots).toBeGreaterThan(10);
    expect(html).toContain('<span class="lbl">');
  });

  it("keeps tap areas on one picture from overlapping the next one", () => {
    const boxes = [
      ...read("hotspots.css").matchAll(
        /\.(h-para-phone-[\w-]+) \{\s*left: ([\d.]+)%;\s*top: ([\d.]+)%;\s*width: ([\d.]+)%;\s*height: ([\d.]+)%/g,
      ),
    ].map((m) => ({ name: m[1], top: Number(m[3]), bottom: Number(m[3]) + Number(m[5]) }));
    const card = boxes.find((b) => b.name === "h-para-phone-goal-card");
    const start = boxes.find((b) => b.name === "h-para-phone-start");
    expect(card).toBeDefined();
    expect(start).toBeDefined();
    expect(card!.bottom).toBeLessThanOrEqual(start!.top + 0.05);
  });

  it("keeps every tap area inside its picture and the motion off for reduced motion", () => {
    const boxes = (css: string) =>
      [
        ...css.matchAll(
          /left:\s*([\d.]+)%;\s*top:\s*([\d.]+)%;\s*width:\s*([\d.]+)%;\s*height:\s*([\d.]+)%/g,
        ),
      ].map((m) => m.slice(1).map(Number) as [number, number, number, number]);
    const outside = (css: string) =>
      boxes(css).filter(([x, y, w, h]) => x + w > 100.05 || y + h > 100.05);
    const real = read("hotspots.css");
    expect(boxes(real).length).toBeGreaterThan(10);
    expect(outside(real)).toEqual([]);
    // The check itself must be able to fail: a box running past the picture is caught.
    expect(
      outside(".x {\n  left: 60%;\n  top: 10%;\n  width: 50%;\n  height: 5%;\n}"),
    ).toHaveLength(1);
    const css = read("tour.css");
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)[^@]*animation: pulse/);
    expect(css).toMatch(/min-height: 44px/);
  });

  it("uses only pictures and tap areas made for the size a picture is shown at", () => {
    // A picture shown to tablets that was made at computer size is a computer picture: its frame,
    // its image files and its tap areas all say computer, so nothing is placed for another size.
    const figures = html.split(/<figure\s/).slice(1);
    expect(figures.length).toBeGreaterThan(20);
    for (const f of figures) {
      const cls = /class="shot ([^"]*)"/.exec(f)?.[1] ?? "";
      const frame = ["computer", "tablet", "phone"].find((d) => cls.split(" ").includes(d));
      const used = new Set(
        [...f.matchAll(/(?:img\/[\w-]*?|\bh-[\w]*?)-?(computer|tablet|phone)\b/g)].map((m) => m[1]),
      );
      if (frame && used.size) expect([...used], f.slice(0, 120)).toEqual([frame]);
    }
  });

  it("opens the practice app in a new tab without passing anything along", () => {
    const link = /<a\s+class="try"([^>]*)>\s*Try the practice app\s*<\/a\s*>/.exec(html);
    expect(link).not.toBeNull();
    const attrs = link?.[1] ?? "";
    expect(attrs).toMatch(/href="\.\.\/"/);
    expect(attrs).toMatch(/target="_blank"/);
    expect(attrs).toMatch(/rel="noopener noreferrer"/);
    expect(html).not.toMatch(/href="\.\.\/[?#]/);
  });
});
