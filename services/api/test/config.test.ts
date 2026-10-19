import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, resolveFieldKey } from "../src/config.ts";

describe("field key resolution", () => {
  it("prefers an explicit key, and returns nothing when neither is set", () => {
    expect(resolveFieldKey({ IEP_FIELD_KEY: "abc" })).toBe("abc");
    expect(resolveFieldKey({})).toBeUndefined();
  });

  it("creates a random 32-byte key file once, then reuses it", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "iep-key-"));
    const file = path.join(dir, "sub", "field.key");
    const first = resolveFieldKey({ IEP_FIELD_KEY_FILE: file })!;
    expect(Buffer.from(first, "base64")).toHaveLength(32);
    expect(resolveFieldKey({ IEP_FIELD_KEY_FILE: file })).toBe(first);
    expect((await readFile(file, "utf8")).trim()).toBe(first);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    const other = path.join(dir, "other.key");
    expect(resolveFieldKey({ IEP_FIELD_KEY_FILE: other })).not.toBe(first);
  });
});

describe("local key stand-in", () => {
  it("is unusable outside synthetic mode: the server refuses to start", () => {
    expect(() => loadConfig({ IEP_FIELD_KEY: "x" })).toThrow(/synthetic/);
    expect(() => loadConfig({ IEP_DATA_CLASS: "real", IEP_FIELD_KEY: "x" })).toThrow(/synthetic/);
  });
});
