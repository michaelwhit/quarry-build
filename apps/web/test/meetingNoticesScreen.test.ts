import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { setRole } from "../src/data/roles.ts";
import { readFileSync } from "node:fs";
import { MeetingNotices, TickCopy, canUseNotices } from "../src/ui/MeetingNotices.tsx";

const draw = () => renderToString(createElement(MeetingNotices)).replaceAll("<!-- -->", "");

beforeEach(() => setRole("case_manager"));

describe("meeting notices screen", () => {
  it("opens on the invitation with each missing entry named and nothing to copy yet", () => {
    const html = draw();
    expect(html).toContain("Meeting notices");
    expect(html).toContain("Meeting invitation");
    expect(html).toContain("Consent request");
    expect(html).toContain("Evaluation timeline");
    expect(html).toContain("Add the meeting time.");
    expect(html).toContain("Add at least one person invited.");
    expect(html).not.toContain("Copy Date, time and place");
    expect(html).not.toContain("Copy Contact for questions");
  });

  it("offers the standard lines that need no entry, behind a read tick", () => {
    const html = draw();
    expect(html).toContain("If this time does not work for you");
    expect(html).toContain("I read this and it is right");
    expect(html).toContain("disabled");
  });

  it("is limited to staff roles and never says sent or filed", () => {
    expect(canUseNotices("case_manager")).toBe(true);
    expect(canUseNotices("related_service_provider")).toBe(false);
    expect(canUseNotices("paraprofessional")).toBe(false);
    setRole("paraprofessional");
    expect(draw()).toContain("Not available for this role");
    setRole("sped_director");
    expect(draw()).not.toMatch(/\b(filed|accepted)\b/i);
  });

  it("keeps Copy off until the text is ticked, for every box including the timeline", () => {
    const html = renderToString(
      createElement(TickCopy, { label: "the timeline", text: "Day 45" }),
    ).replaceAll("<!-- -->", "");
    expect(html).toContain("I read this and it is right");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Copy the timeline/);
    // One shared copy control: no box writes to the clipboard on its own.
    const src = readFileSync(new URL("../src/ui/MeetingNotices.tsx", import.meta.url), "utf8");
    expect(src.match(/clipboard\.writeText/g)).toHaveLength(1);
  });
});
