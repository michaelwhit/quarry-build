import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "./config.ts";
import { FieldCrypto } from "./crypto/fields.ts";
import { createPool } from "./db.ts";
import { createAuthModule, denyAllDeps, type AuthDeps } from "./modules/auth/index.ts";
import { calendarModule } from "./modules/calendar/index.ts";
import { caseloadsModule } from "./modules/caseloads/index.ts";
import { goalsModule } from "./modules/goals/index.ts";
import {
  createHardeningModule,
  defaultHardening,
  type HardeningOptions,
} from "./modules/hardening/index.ts";
import { healthModule } from "./modules/health/index.ts";
import { meModule } from "./modules/me/index.ts";
import { studentsModule } from "./modules/students/index.ts";
import { syncModule } from "./modules/sync/index.ts";
import { HttpProblem } from "./session.ts";

/**
 * Builds the api. Module registration order matters: auth registers the deny-by-default hook
 * that every /v0 route sits behind, so it comes before any module that serves student data.
 */
export async function buildApp(
  config: Config,
  auth: AuthDeps = denyAllDeps,
  hardening: HardeningOptions = { ...defaultHardening, hsts: config.hsts },
): Promise<FastifyInstance> {
  const hops: number = config.trustProxy === false ? 0 : config.trustProxy;
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      // Headers can carry tokens; bodies can carry student data. Neither is ever logged.
      redact: {
        paths: ["req.headers.authorization", "req.headers.dpop", "req.headers.cookie"],
        censor: "[redacted]",
      },
    },
    // Request ids are opaque and safe to log.
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 1_048_576,
    // Slow-loris and stuck-connection limits.
    connectionTimeout: 30_000,
    requestTimeout: 30_000,
    keepAliveTimeout: 5_000,
    // A hop count, not "all": the client writes the leftmost X-Forwarded-For entry.
    trustProxy: hops === 0 ? false : (_addr: string, hop: number) => hop < hops,
  });

  // First, so the rate limit and headers apply to every route, including unknown paths and 401s.
  await app.register(createHardeningModule(hardening));

  // Problem details carry a status and a title, never the underlying error text (which could
  // quote a row). Unexpected errors are logged by Fastify with the request id only.
  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    const status = err instanceof HttpProblem ? err.status : (err.statusCode ?? 500);
    const clientError = status >= 400 && status < 500;
    if (!clientError) req.log.error({ err: { name: err.name } }, "request failed");
    const title =
      err instanceof HttpProblem
        ? err.title
        : clientError
          ? "Bad Request"
          : "Internal Server Error";
    const code = clientError || (err instanceof HttpProblem && status === 503) ? status : 500;
    return reply
      .code(code)
      .type("application/problem+json")
      .send({ type: "about:blank", title, status: code });
  });

  await app.register(healthModule, { version: config.version });
  await app.register(createAuthModule(auth));

  if (config.databaseUrl) {
    if (!config.fieldKey) throw new Error("IEP_FIELD_KEY is required when DATABASE_URL is set");
    const db = createPool(config.databaseUrl);
    app.addHook("onClose", async () => {
      await db.end();
    });
    const fieldCrypto = FieldCrypto.fromBase64(config.fieldKey);
    await app.register(meModule, { db });
    await app.register(studentsModule, { db, crypto: fieldCrypto });
    await app.register(goalsModule, { db });
    await app.register(calendarModule, { db });
    await app.register(caseloadsModule, { db, crypto: fieldCrypto });
    await app.register(syncModule, { db, crypto: fieldCrypto });
  }

  // Still to land: audit (Track 1) · reports (Track 5) · ai (Track 4)

  return app;
}
