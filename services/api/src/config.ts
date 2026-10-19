import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface Config {
  port: number;
  host: string;
  databaseUrl: string | undefined;
  /** Base64 32-byte master key for field encryption: a local stand-in for Cloud KMS. */
  fieldKey: string | undefined;
  version: string;
  /** Send HSTS (set when the api sits behind TLS). */
  hsts: boolean;
  /** Number of proxy hops to trust for X-Forwarded-For (0 = none). Never "all": a client can write the first entry. */
  trustProxy: number | false;
}

/**
 * Reads configuration from the environment. Sprint two has no real-data environment, so the
 * server refuses to start unless it is explicitly marked as holding synthetic data only
 * (security design section 4.6, Stage A).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env.IEP_DATA_CLASS !== "synthetic") {
    throw new Error(
      "IEP_DATA_CLASS must be 'synthetic'. This build may only run against fake data (see CONTRIBUTING.md).",
    );
  }
  return {
    port: Number(env.PORT ?? 8080),
    host: env.HOST ?? "127.0.0.1",
    databaseUrl: env.DATABASE_URL,
    fieldKey: resolveFieldKey(env),
    version: env.IEP_VERSION ?? "0.0.0-dev",
    hsts: env.IEP_HSTS === "1",
    trustProxy: parseHops(env.IEP_TRUST_PROXY_HOPS),
  };
}

/**
 * The field-encryption master key. IEP_FIELD_KEY wins (a secret supplied by the environment).
 * Otherwise, for local runs, IEP_FIELD_KEY_FILE names a file that is created on first start with
 * a random key and reused afterwards, so no key is ever committed and restarts can still read
 * what they stored. Cloud KMS replaces both later.
 */
export function resolveFieldKey(env: NodeJS.ProcessEnv): string | undefined {
  if (env.IEP_FIELD_KEY) return env.IEP_FIELD_KEY;
  const file = env.IEP_FIELD_KEY_FILE;
  if (!file) return undefined;
  try {
    return readFileSync(file, "utf8").trim();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const key = randomBytes(32).toString("base64");
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${key}\n`, { mode: 0o600, flag: "wx" });
  return key;
}

function parseHops(raw: string | undefined): number | false {
  if (raw === undefined || raw === "") return false;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 5) {
    throw new Error("IEP_TRUST_PROXY_HOPS must be a whole number from 0 to 5.");
  }
  return n === 0 ? false : n;
}
