import { describe, expect, it } from "vitest";
import { accommodations } from "../src/data/library.ts";
import { bulkMessage, planBulk } from "../src/data/libraryBulk.ts";

const [a, b, c] = accommodations;

describe("planBulk", () => {
  it("adds what the student does not have and leaves out what they do, ignoring case", () => {
    const plan = planBulk([a!, b!, c!], [b!.title.toUpperCase()]);
    expect(plan.add.map((x) => x.id)).toEqual([a!.id, c!.id]);
    expect(plan.skip.map((x) => x.id)).toEqual([b!.id]);
  });
  it("leaves out wording the single form would refuse, and a title picked twice", () => {
    const vague = { ...a!, id: "x1", frequency: "As needed" };
    const blank = { ...b!, id: "x2", location: " " };
    const twin = { ...c!, id: "x3" };
    const plan = planBulk([vague, blank, c!, twin], []);
    expect(plan.add.map((x) => x.id)).toEqual([c!.id]);
    expect(plan.skip).toHaveLength(3);
  });
  it("uses the sample library as it stands: every item can be added", () => {
    expect(planBulk(accommodations, []).skip).toEqual([]);
  });
});

describe("bulkMessage", () => {
  it("says how many were added and how many were left out", () => {
    expect(bulkMessage("Sample L.", 3, 0)).toBe("Sample L.: added 3 accommodations.");
    expect(bulkMessage("Sample L.", 1, 2)).toBe(
      "Sample L.: added 1 accommodation. Left out 2: already there or not usable.",
    );
    expect(bulkMessage("Sample L.", 0, 2)).toContain("nothing was added");
  });
});
