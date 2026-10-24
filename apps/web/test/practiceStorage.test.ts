import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRACTICE_KEYS,
  clearPracticeStorage,
  hasPracticeData,
} from "../src/data/practiceStorage.ts";

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });

describe("practice storage keys", () => {
  it("lists every goalline-practice key the data modules use", () => {
    const used = new Set<string>();
    for (const f of files("src/data"))
      for (const m of readFileSync(f, "utf8").matchAll(/"(goalline-practice-[a-z0-9-]+)"/g))
        used.add(m[1] ?? "");
    expect(used.size).toBeGreaterThan(10);
    expect([...used].filter((k) => !PRACTICE_KEYS.includes(k))).toEqual([]);
    expect(new Set(PRACTICE_KEYS).size).toBe(PRACTICE_KEYS.length);
  });

  it("removes each key from every store it is given, and keeps other keys", () => {
    const make = () => {
      const m = new Map<string, string>(PRACTICE_KEYS.map((k) => [k, "x"]));
      m.set("other", "keep");
      return m;
    };
    const a = make();
    const b = make();
    const wrap = (m: Map<string, string>) => ({ removeItem: (k: string) => void m.delete(k) });
    clearPracticeStorage([wrap(a), wrap(b)]);
    expect([...a.keys()]).toEqual(["other"]);
    expect([...b.keys()]).toEqual(["other"]);
  });

  it("keeps going when a store refuses", () => {
    const seen: string[] = [];
    const blocked = {
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const ok = { removeItem: (k: string) => void seen.push(k) };
    expect(() => clearPracticeStorage([blocked, ok])).not.toThrow();
    expect(seen).toEqual([...PRACTICE_KEYS]);
  });

  it.each(PRACTICE_KEYS)("%s: seen as data, and gone after a clear", (key) => {
    const m = new Map<string, string>();
    const store = {
      getItem: (k: string) => m.get(k) ?? null,
      removeItem: (k: string) => void m.delete(k),
    };
    expect(hasPracticeData([store])).toBe(false);
    m.set(key, "{}");
    expect(hasPracticeData([store])).toBe(true);
    clearPracticeStorage([store]);
    expect(m.size).toBe(0);
    expect(hasPracticeData([store])).toBe(false);
  });

  it("does not count a store that throws as holding data", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(hasPracticeData([blocked])).toBe(false);
  });
});

describe("the e2e list of keys", () => {
  it("matches the list in the app", () => {
    const text = readFileSync("e2e/clearPracticeData.e2e.ts", "utf8");
    const listed = [...text.matchAll(/^\s+"(goalline-practice-[a-z0-9-]+)",$/gm)].map((m) => m[1]);
    expect([...listed].sort()).toEqual([...PRACTICE_KEYS].sort());
  });
});
