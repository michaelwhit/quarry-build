import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

export interface HardeningOptions {
  /** Requests allowed per client address in one window. Flood protection, not per-user fairness:
   *  a whole school can share one public address, so this is deliberately generous. */
  rateLimitMax: number;
  /** Requests allowed per signed-in staff member in one window (checked after sign-in). */
  principalRateLimitMax: number;
  rateLimitWindowMs: number;
  /** Hard cap on tracked keys per limiter; unknown keys are refused once the cap is full of live entries. */
  maxTrackedKeys: number;
  /** Send Strict-Transport-Security. Off for plain-http local development. */
  hsts: boolean;
}

export const defaultHardening: HardeningOptions = {
  rateLimitMax: 3000,
  principalRateLimitMax: 600,
  rateLimitWindowMs: 60_000,
  maxTrackedKeys: 50_000,
  hsts: false,
};

/** IPv6 clients are limited by their /64 (anyone can mint addresses inside one); IPv4 as is. */
export function limiterKey(ip: string): string {
  if (!ip.includes(":") || ip.startsWith("::ffff:")) return ip.replace(/^::ffff:/, "");
  const [head = ""] = ip.split("%");
  const [left = "", right = ""] = head.split("::");
  const groups = left.split(":").filter((g) => g !== "");
  const tail = right.split(":").filter((g) => g !== "");
  const full = head.includes("::")
    ? [...groups, ...Array<string>(Math.max(0, 8 - groups.length - tail.length)).fill("0"), ...tail]
    : groups;
  return `${full.slice(0, 4).join(":")}::/64`;
}

class FixedWindowLimiter {
  private windows = new Map<string, { start: number; count: number }>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly cap: number;

  constructor(max: number, windowMs: number, cap: number) {
    this.max = max;
    this.windowMs = windowMs;
    this.cap = cap;
  }

  /** Returns seconds to wait when the key is over its limit, otherwise null. */
  hit(key: string, now: number): number | null {
    const w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      // Unknown keys are refused rather than tracked once the map is full of live entries.
      if (!w && this.windows.size >= this.cap) return Math.ceil(this.windowMs / 1000);
      this.windows.set(key, { start: now, count: 1 });
      return null;
    }
    w.count += 1;
    return w.count > this.max
      ? Math.max(1, Math.ceil((w.start + this.windowMs - now) / 1000))
      : null;
  }

  sweep(now: number) {
    for (const [k, v] of this.windows) if (now - v.start >= this.windowMs) this.windows.delete(k);
  }
}

/**
 * HTTP hardening for every response (security design sections 2 and 4.4, review S-1).
 *
 * - Responses carry student data, so no shared cache or device cache may keep them: no-store.
 * - Fixed-window rate limit per client address (before auth) and per signed-in staff member
 *   (after auth), answered 429. In memory, so per instance; the edge limit (Cloud Armor) is
 *   added with the cloud environment.
 * - No CORS headers are ever sent: the clients are native apps, not browsers.
 */
export function createHardeningModule(opts: HardeningOptions = defaultHardening) {
  const plugin: FastifyPluginAsync = async (app) => {
    const byAddress = new FixedWindowLimiter(
      opts.rateLimitMax,
      opts.rateLimitWindowMs,
      opts.maxTrackedKeys,
    );
    const byPrincipal = new FixedWindowLimiter(
      opts.principalRateLimitMax,
      opts.rateLimitWindowMs,
      opts.maxTrackedKeys,
    );
    // Sweep on a timer, not inline, so a flood of new keys cannot make each request rescan the map.
    const timer = setInterval(() => {
      const now = Date.now();
      byAddress.sweep(now);
      byPrincipal.sweep(now);
    }, opts.rateLimitWindowMs);
    timer.unref();
    app.addHook("onClose", async () => clearInterval(timer));

    const tooMany = (reply: import("fastify").FastifyReply, retry: number) =>
      reply
        .code(429)
        .header("retry-after", String(retry))
        .type("application/problem+json")
        .send({ type: "about:blank", title: "Too Many Requests", status: 429 });

    app.addHook("onRequest", async (req, reply) => {
      const retry = byAddress.hit(limiterKey(req.ip), Date.now());
      if (retry !== null) return tooMany(reply, retry);
    });

    // Runs after the auth module's onRequest hook has set req.auth.
    app.addHook("preHandler", async (req, reply) => {
      const staffId = req.auth?.principal.staffId;
      if (!staffId) return;
      const retry = byPrincipal.hit(`${req.auth?.principal.tenantId}:${staffId}`, Date.now());
      if (retry !== null) return tooMany(reply, retry);
    });

    app.addHook("onSend", async (_req, reply, payload) => {
      reply.header("cache-control", "no-store");
      reply.header("pragma", "no-cache");
      reply.header("x-content-type-options", "nosniff");
      reply.header("referrer-policy", "no-referrer");
      reply.header("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
      if (opts.hsts)
        reply.header("strict-transport-security", "max-age=31536000; includeSubDomains");
      return payload;
    });
  };
  return fp(plugin, { name: "hardening" });
}
