import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { denyAllDeps } from "../src/modules/auth/index.ts";
import { limiterKey } from "../src/modules/hardening/index.ts";

const config = loadConfig({ IEP_DATA_CLASS: "synthetic", IEP_VERSION: "test" });

describe("http hardening", () => {
  it("marks every response no-store with security headers, including 401 and 404", async () => {
    const app = await buildApp(config);
    for (const url of ["/healthz", "/v0/students", "/nope"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.headers["cache-control"], url).toBe("no-store");
      expect(res.headers["x-content-type-options"], url).toBe("nosniff");
      expect(res.headers["content-security-policy"], url).toContain("default-src 'none'");
      expect(res.headers["access-control-allow-origin"], url).toBeUndefined();
    }
  });

  it("sends HSTS only when configured", async () => {
    const off = await buildApp(config);
    expect(
      (await off.inject({ url: "/healthz" })).headers["strict-transport-security"],
    ).toBeUndefined();
    const on = await buildApp(loadConfig({ IEP_DATA_CLASS: "synthetic", IEP_HSTS: "1" }));
    expect((await on.inject({ url: "/healthz" })).headers["strict-transport-security"]).toContain(
      "max-age",
    );
  });

  it("answers 429 with Retry-After once a client passes the limit, before auth runs", async () => {
    const app = await buildApp(config, denyAllDeps, {
      rateLimitMax: 3,
      principalRateLimitMax: 100,
      maxTrackedKeys: 1000,
      rateLimitWindowMs: 60_000,
      hsts: false,
    });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await app.inject({ url: "/v0/students" })).statusCode);
    expect(codes).toEqual([401, 401, 401, 429, 429]);
    const limited = await app.inject({ url: "/v0/students" });
    expect(limited.headers["retry-after"]).toBeDefined();
    expect(limited.headers["cache-control"]).toBe("no-store");
  });

  it("a spoofed leftmost X-Forwarded-For entry does not escape the limit", async () => {
    const proxied = loadConfig({
      IEP_DATA_CLASS: "synthetic",
      IEP_TRUST_PROXY_HOPS: "1",
    });
    const app = await buildApp(proxied, denyAllDeps, {
      rateLimitMax: 3,
      principalRateLimitMax: 100,
      maxTrackedKeys: 1000,
      rateLimitWindowMs: 60_000,
      hsts: false,
    });
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await app.inject({
        url: "/v0/students",
        remoteAddress: "10.0.0.1",
        headers: { "x-forwarded-for": `198.51.100.${i}, 203.0.113.9` },
      });
      codes.push(res.statusCode);
    }
    expect(codes).toEqual([401, 401, 401, 429, 429, 429]);
  });

  it("rejects a bad hop count and never trusts every hop", () => {
    expect(loadConfig({ IEP_DATA_CLASS: "synthetic" }).trustProxy).toBe(false);
    expect(loadConfig({ IEP_DATA_CLASS: "synthetic", IEP_TRUST_PROXY_HOPS: "2" }).trustProxy).toBe(
      2,
    );
    expect(() => loadConfig({ IEP_DATA_CLASS: "synthetic", IEP_TRUST_PROXY_HOPS: "true" })).toThrow(
      /HOPS/,
    );
  });

  it("refuses unknown addresses once the tracking cap is full instead of growing", async () => {
    const app = await buildApp(config, denyAllDeps, {
      rateLimitMax: 100,
      principalRateLimitMax: 100,
      maxTrackedKeys: 2,
      rateLimitWindowMs: 60_000,
      hsts: false,
    });
    const codes: number[] = [];
    for (const ip of ["192.0.2.1", "192.0.2.2", "192.0.2.3", "192.0.2.1"]) {
      codes.push((await app.inject({ url: "/v0/students", remoteAddress: ip })).statusCode);
    }
    expect(codes).toEqual([401, 401, 429, 401]);
  });

  it("limits IPv6 clients by their /64", () => {
    expect(limiterKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe(limiterKey("2001:db8:1:2::1"));
    expect(limiterKey("2001:db8:1:3::1")).not.toBe(limiterKey("2001:db8:1:2::1"));
    expect(limiterKey("::ffff:192.0.2.7")).toBe("192.0.2.7");
  });
});
