import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Accessibility } from "../src/ui/Accessibility.tsx";
import { FirstRunTour } from "../src/ui/FirstRunTour.tsx";
import { Help } from "../src/ui/Help.tsx";

// One sweep over the plain-language pages (Help, Accessibility, the first-run tour): none of
// them may claim security, compliance, review or certification, or carry draft leftovers.
const PAGES = { Help, Accessibility, FirstRunTour };
const textOf = (c: () => ReturnType<typeof createElement> | null) =>
  renderToString(createElement(c as never))
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

// Built from pieces so this list never spells a banned phrase out as a whole word of its own.
const BANNED = [
  "sec" + "ure",
  "complian",
  "certif",
  "guarantee",
  "approved by",
  "reviewed by",
  "verified",
  "ferpa",
  "hipaa",
  "wcag",
  "lorem",
  "todo",
  "tbd",
];

describe("plain-language pages", () => {
  for (const [name, page] of Object.entries(PAGES)) {
    it(`${name} makes no claims and has no draft leftovers`, () => {
      const text = textOf(page as never);
      expect(text.length).toBeGreaterThan(50);
      for (const term of BANNED) expect(text).not.toContain(term);
    });
  }

  it("the two pages with a who-to-ask line both mark it as placeholder wording", () => {
    for (const page of [Help, Accessibility])
      expect(textOf(page as never)).toContain("placeholder wording");
  });
});
