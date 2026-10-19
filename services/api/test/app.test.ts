import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";

const config = loadConfig({ IEP_DATA_CLASS: "synthetic", IEP_VERSION: "test" });

describe("api foundation", () => {
  it("serves /healthz without a session", async () => {
    const app = await buildApp(config);
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", version: "test" });
  });

  it("refuses to start without the synthetic data marker", () => {
    expect(() => loadConfig({})).toThrow(/IEP_DATA_CLASS/);
    expect(() => loadConfig({ IEP_DATA_CLASS: "real" })).toThrow(/IEP_DATA_CLASS/);
  });

  it("denies every contract operation that needs a session", async () => {
    const spec = parse(
      await readFile(new URL("../../../packages/openapi/api.yaml", import.meta.url), "utf8"),
    ) as {
      security?: unknown[];
      paths: Record<string, Record<string, { security?: unknown[] }>>;
    };
    const app = await buildApp(config);
    let checked = 0;
    for (const [path, ops] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(ops)) {
        const security = op.security ?? spec.security ?? [];
        if (security.length === 0) continue;
        const url = path.replace(/\{[^}]+\}/g, "01900000-0000-7000-8000-000000000000");
        const res = await app.inject({
          method: method.toUpperCase() as "GET",
          url: `${url}?since=0`,
        });
        expect(res.statusCode, `${method.toUpperCase()} ${path}`).toBe(401);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("answers unknown paths with 401, not 404, so nothing reveals what exists", async () => {
    const app = await buildApp(config);
    for (const url of ["/v0/does-not-exist", "/other", "//v0/students", "/healthz/extra"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode, url).toBe(401);
    }
  });
});
