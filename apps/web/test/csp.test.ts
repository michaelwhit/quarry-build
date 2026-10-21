import { describe, expect, it } from "vitest";
import { CSP, apiOrigin, cspFor, metaFor } from "../scripts/csp.mjs";

describe("API origin build setting", () => {
  it("is empty and the policy unchanged when unset", () => {
    expect(apiOrigin(undefined)).toBe("");
    expect(apiOrigin("  ")).toBe("");
    expect(CSP).toContain("connect-src 'self';");
    expect(cspFor("")).toBe(CSP);
  });

  it("adds exactly one origin to connect-src and changes nothing else", () => {
    const origin = apiOrigin("https://api.example.test");
    expect(origin).toBe("https://api.example.test");
    const policy = cspFor(origin);
    expect(policy).toContain("connect-src 'self' https://api.example.test;");
    expect(policy.replace(" https://api.example.test", "")).toBe(CSP);
    expect(metaFor(origin)).not.toContain("frame-ancestors");
    expect(/unsafe-|\*/.test(policy)).toBe(false);
  });

  it("keeps a port and drops a trailing slash", () => {
    expect(apiOrigin("https://api.example.test:8443/")).toBe("https://api.example.test:8443");
    expect(apiOrigin("http://localhost:4000")).toBe("http://localhost:4000");
  });

  it("refuses anything that is not a bare https origin", () => {
    for (const bad of [
      "http://api.example.test",
      "api.example.test",
      "https://api.example.test/v0",
      "https://api.example.test/?a=1",
      "https://api.example.test/#x",
      "https://user:pw@api.example.test",
      "https://*.example.test",
      "ftp://api.example.test",
      "javascript:alert(1)",
    ])
      expect(() => apiOrigin(bad), bad).toThrow();
  });
});
