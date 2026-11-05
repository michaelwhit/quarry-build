import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import {
  BOXES,
  NOT_NEEDED,
  resetConsiderationsForTests,
  setConsideration,
  useConsiderationStorage,
} from "../src/data/considerations.ts";
import { students } from "../src/data/district.ts";
import { setRole } from "../src/data/roles.ts";
import { loadSample } from "../src/data/workspace.ts";
import { Considerations } from "../src/ui/Considerations.tsx";

setRole("sped_director");

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
const sid = () => students[0]!.student.id;
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/'/g, "&#x27;");
const render = () => renderToString(createElement(Considerations, { studentId: sid() }));

describe("Considerations screen", () => {
  beforeEach(() => {
    loadSample();
    useConsiderationStorage(mem());
    resetConsiderationsForTests();
  });
  it("shows one fieldset with a legend and two choices per box, and no text box yet", () => {
    const html = render();
    expect(html).toContain("Write the consideration boxes");
    expect(html.match(/<fieldset/g)?.length).toBe(BOXES.length);
    expect(html.match(/<legend>/g)?.length).toBe(BOXES.length);
    expect(html.match(/type="radio"/g)?.length).toBe(BOXES.length * 2);
    expect(html).not.toContain("<textarea");
    for (const b of BOXES) expect(html).toContain(esc(b.label));
  });
  it("asks for the team's decision when a box is needed, a reason when not needed", () => {
    const [a, b] = BOXES;
    setConsideration(sid(), a!.id, { choice: "needed", text: "" });
    setConsideration(sid(), b!.id, { choice: "not_needed", text: "" });
    const html = render();
    expect(html).toContain("What the team decided");
    expect(html).toContain("Reason (optional)");
    expect(html.match(/<textarea/g)?.length).toBe(2);
  });
  it("shows the standard opening line only for a not-needed box", () => {
    const [a] = BOXES;
    setConsideration(sid(), a!.id, { choice: "needed", text: "x" });
    expect(render()).not.toContain("Starts with:");
    setConsideration(sid(), a!.id, { choice: "not_needed", text: "" });
    const html = render();
    expect(html).toContain("Starts with:");
    expect(html).toContain(esc(NOT_NEEDED));
  });
});
