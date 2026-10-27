import { describe, expect, it } from "vitest";
import {
  ADAPTER_KINDS,
  ADAPTER_KIND_BY_ID,
  UNTAGGED_ACCOMMODATIONS,
  adapterKindOf,
} from "../src/data/adapterKinds.ts";
import { accommodations } from "../src/data/library.ts";

describe("assignment adapter kinds", () => {
  it("gives every library accommodation a kind or puts it on the teacher-handles list", () => {
    for (const a of accommodations) {
      const tagged = Object.hasOwn(ADAPTER_KIND_BY_ID, a.id);
      const untagged = UNTAGGED_ACCOMMODATIONS.includes(a.id);
      expect(tagged !== untagged, `${a.id} must be in exactly one list`).toBe(true);
    }
  });

  it("names only real accommodations and only kinds on the closed list", () => {
    const ids = new Set(accommodations.map((a) => a.id));
    for (const [id, kind] of Object.entries(ADAPTER_KIND_BY_ID)) {
      expect(ids.has(id), id).toBe(true);
      expect(ADAPTER_KINDS).toContain(kind);
    }
    for (const id of UNTAGGED_ACCOMMODATIONS) expect(ids.has(id), id).toBe(true);
  });

  it("looks a kind up by id and says nothing for an untagged one", () => {
    expect(adapterKindOf("a-chunk")).toBe("chunking");
    expect(adapterKindOf("a-time")).toBe("extended_time");
    expect(adapterKindOf("a-largeprint")).toBe("large_print");
    expect(adapterKindOf("a-clutter")).toBe("reduced_clutter");
    expect(adapterKindOf("a-reduced")).toBe("fewer_items");
    expect(adapterKindOf("a-notes")).toBeUndefined();
    expect(adapterKindOf("nope")).toBeUndefined();
    expect(adapterKindOf("constructor")).toBeUndefined();
    expect(adapterKindOf("toString")).toBeUndefined();
  });

  it("uses plain snake_case names", () => {
    for (const k of ADAPTER_KINDS) expect(k).toMatch(/^[a-z]+(_[a-z]+)*$/);
  });
});
