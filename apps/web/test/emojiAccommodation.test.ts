import { beforeEach, describe, expect, it } from "vitest";
import {
  type StorageLike,
  addAccommodation,
  addStudent,
  clearAll,
  exportText,
  getWorkspace,
  parse,
  useStorage,
} from "../src/data/workspace.ts";

// An accommodation's text fields are cut by characters, not UTF-16 units, so a full field of emoji
// is kept whole and a longer one is cut between emoji.
const EMOJI = "😀";

function fakeStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe("accommodation fields count characters", () => {
  beforeEach(() => {
    useStorage(fakeStorage());
    clearAll();
  });
  it("keeps a full field of emoji and cuts a longer one between emoji", () => {
    const sid = addStudent({ firstName: "Ava", lastName: "Stone", grade: "3" });
    addAccommodation(sid, {
      title: EMOJI.repeat(130),
      kind: EMOJI.repeat(45),
      description: EMOJI.repeat(600),
      location: EMOJI.repeat(200),
      frequency: EMOJI.repeat(201),
      duration: EMOJI.repeat(200),
    });
    const a = getWorkspace().accommodations[0]!;
    expect(a.title).toBe(EMOJI.repeat(120));
    expect(a.kind).toBe(EMOJI.repeat(40));
    expect(a.description).toBe(EMOJI.repeat(600));
    expect(a.location).toBe(EMOJI.repeat(200));
    expect(a.frequency).toBe(EMOJI.repeat(200));
    expect(a.duration).toBe(EMOJI.repeat(200));
  });
  it("reads a saved full field of emoji back instead of dropping the accommodation", () => {
    const sid = addStudent({ firstName: "Ava", lastName: "Stone", grade: "3" });
    addAccommodation(sid, {
      title: EMOJI.repeat(120),
      kind: EMOJI.repeat(40),
      description: EMOJI.repeat(600),
      location: EMOJI.repeat(200),
      frequency: EMOJI.repeat(200),
      duration: EMOJI.repeat(200),
    });
    const back = parse(exportText());
    expect(back?.accommodations).toHaveLength(1);
    expect(back?.accommodations[0]?.description).toBe(EMOJI.repeat(600));
  });
  it("still refuses a field one character over its limit", () => {
    const sid = addStudent({ firstName: "Ava", lastName: "Stone", grade: "3" });
    addAccommodation(sid, {
      title: "Extra time",
      kind: "accommodation",
      description: "More time.",
      location: "In class",
      frequency: "On tests",
      duration: "For this plan",
    });
    const saved = JSON.parse(exportText()) as { accommodations: { location: string }[] };
    saved.accommodations[0]!.location = EMOJI.repeat(201);
    expect(parse(JSON.stringify(saved))?.accommodations).toHaveLength(0);
  });
});
