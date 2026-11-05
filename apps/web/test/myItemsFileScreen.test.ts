import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addMyAccommodation,
  resetMyAccommodationsForTests,
  setMyAccommodationsStorageForTests,
} from "../src/data/myAccommodations.ts";
import { resetMyItemsForTests, setMyItemsStorageForTests } from "../src/data/myItems.ts";
import { MyItemsFile } from "../src/ui/MyItemsFile.tsx";

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};

beforeEach(() => {
  setMyItemsStorageForTests(mem());
  setMyAccommodationsStorageForTests(mem());
  resetMyItemsForTests();
  resetMyAccommodationsForTests();
});

const render = () => renderToString(createElement(MyItemsFile));

describe("My items file screen", () => {
  it("says it is wording only, practice, and to keep student names out", () => {
    const html = render();
    expect(html).toContain("wording only, made up for practice");
    expect(html).toContain("Load only a file saved from this app");
    expect(html).toContain("Do not put student names in your wording");
  });
  it("turns Save off and explains why while My items is empty", () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*disabled/);
    expect(html).toContain('aria-describedby="my-items-file-hint"');
    expect(html).toContain("Nothing in My items yet.");
  });
  it("turns Save on and drops the hint once there is something to save", () => {
    addMyAccommodation({
      title: "Extra time",
      kind: "accommodation",
      category: "Timing",
      description: "More time on tests.",
      location: "Classroom",
      frequency: "On timed work",
      duration: "This plan",
    });
    const html = render();
    expect(html).not.toMatch(/<button[^>]*disabled/);
    expect(html).not.toContain("my-items-file-hint");
    expect(html).not.toContain("Nothing in My items yet.");
  });
  it("only accepts JSON files for loading and keeps a status area", () => {
    const html = render();
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="application/json,.json"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="My items file"');
  });
});
