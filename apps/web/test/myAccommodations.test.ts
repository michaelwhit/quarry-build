import { beforeEach, describe, expect, it } from "vitest";
import { filterAccommodations } from "../src/data/libraryFilter.ts";
import { accommodations } from "../src/data/library.ts";
import {
  MAX_MY_ACCOMMODATIONS,
  MY_ACCOMMODATIONS_KEY,
  addMyAccommodation,
  getMyAccommodations,
  isMyAccommodation,
  isMyAccommodationId,
  removeMyAccommodation,
  resetMyAccommodationsForTests,
  setMyAccommodationsStorageForTests,
} from "../src/data/myAccommodations.ts";
import { PRACTICE_KEYS } from "../src/data/practiceStorage.ts";

const memory = () => {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
};
const base = {
  title: "Extra time on tasks",
  kind: "accommodation" as const,
  category: "Timing",
  description: "The student may take up to 1.5 times the usual time.",
  location: "In the classroom",
  frequency: "On timed work",
  duration: "For this plan",
};

beforeEach(() => {
  setMyAccommodationsStorageForTests(memory());
  resetMyAccommodationsForTests();
});

describe("My accommodations", () => {
  it("saves wording, keeps it for the next visit and finds it by the My items filter", () => {
    const m = memory();
    setMyAccommodationsStorageForTests(m);
    const res = addMyAccommodation({ ...base, frequency: "  Every timed test " });
    expect(res.ok && res.kept).toBe(true);
    expect(getMyAccommodations()[0]?.frequency).toBe("Every timed test");
    setMyAccommodationsStorageForTests(m);
    expect(getMyAccommodations()).toHaveLength(1);
    const mine = getMyAccommodations();
    const only = new Set(mine.map((a) => a.id));
    expect(
      filterAccommodations([...accommodations, ...mine], {
        query: "",
        kind: "",
        category: "",
        only,
      }),
    ).toEqual(mine);
    expect(isMyAccommodationId(mine[0]!.id)).toBe(true);
  });

  it("refuses the same wording twice, blank boxes and a full list", () => {
    expect(addMyAccommodation(base).ok).toBe(true);
    expect(addMyAccommodation(base)).toEqual({ ok: false, reason: "duplicate" });
    expect(addMyAccommodation({ ...base, frequency: "  " })).toEqual({
      ok: false,
      reason: "invalid",
    });
    for (let i = getMyAccommodations().length; i < MAX_MY_ACCOMMODATIONS; i++)
      expect(addMyAccommodation({ ...base, title: `Item ${i}` }).ok).toBe(true);
    expect(addMyAccommodation({ ...base, title: "One more" })).toEqual({
      ok: false,
      reason: "full",
    });
  });

  it("counts characters, so an emoji at the limit is not cut or refused", () => {
    const edge = "😀".repeat(200);
    expect(addMyAccommodation({ ...base, location: edge }).ok).toBe(true);
    expect(addMyAccommodation({ ...base, title: "Another", location: edge + "x" }).ok).toBe(false);
  });

  it("removes one, and ignores saved entries that are not valid", () => {
    const res = addMyAccommodation(base);
    if (!res.ok) throw new Error("not saved");
    removeMyAccommodation(res.id);
    expect(getMyAccommodations()).toEqual([]);
    const m = memory();
    m.store.set(
      MY_ACCOMMODATIONS_KEY,
      JSON.stringify([{ ...base, id: "mya-ok" }, { ...base, id: "a-time" }, { id: "mya-bad" }, 7]),
    );
    setMyAccommodationsStorageForTests(m);
    expect(getMyAccommodations().map((a) => a.id)).toEqual(["mya-ok"]);
    expect(isMyAccommodation({ ...base, id: "mya-ok", kind: "other" })).toBe(false);
  });

  it("says it was not kept when the browser would not save, and is cleared with the practice data", () => {
    setMyAccommodationsStorageForTests({
      getItem: () => null,
      setItem: () => {
        throw new Error("full");
      },
    });
    const res = addMyAccommodation(base);
    expect(res.ok && res.kept).toBe(false);
    expect(PRACTICE_KEYS).toContain(MY_ACCOMMODATIONS_KEY);
  });

  it("keeps only the known fields of a saved item", () => {
    const res = addMyAccommodation({ ...base, extra: "not stored" } as typeof base);
    if (!res.ok) throw new Error("not saved");
    expect(Object.keys(getMyAccommodations()[0]!).sort()).toEqual(
      [
        "category",
        "description",
        "duration",
        "frequency",
        "id",
        "kind",
        "location",
        "title",
      ].sort(),
    );
  });
});
