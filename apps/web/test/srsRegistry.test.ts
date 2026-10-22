import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { setRole } from "../src/data/roles.ts";
import { students } from "../src/data/district.ts";
import { loadSample } from "../src/data/workspace.ts";
import { resetPlForTests, setSlotText, getPl, usePlStorage } from "../src/data/presentLevels.ts";
import { buildPacket, getSectionsVersion, subscribeSections } from "../src/data/srsPacket.ts";
import { SrsPacket } from "../src/ui/SrsPacket.tsx";

setRole("sped_director");
const sid = () => students[0]!.student.id;

beforeEach(() => {
  loadSample();
  usePlStorage({ getItem: () => null, setItem: () => undefined });
  resetPlForTests();
});

describe("section registry", () => {
  it("builds sections from files in src/data/srs", () => {
    const built = buildPacket(sid())
      .filter((s) => s.built)
      .map((s) => s.id);
    expect(built).toContain("plaafp");
    expect(built).toContain("goals");
  });

  it("redraws when a section's store changes", () => {
    let calls = 0;
    const off = subscribeSections(() => calls++);
    const before = getSectionsVersion();
    setSlotText(getPl(sid()), "plaafp.math", "Adds within 10.", { who: "Ms. A" });
    expect(getSectionsVersion()).toBeGreaterThan(before);
    expect(calls).toBeGreaterThan(0);
    off();
  });

  it("shows a section's form in its card", () => {
    const html = renderToString(createElement(SrsPacket, { studentId: sid() }));
    expect(html).toContain("Write present levels");
  });
});
