#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicKey } from "node:crypto";
import path from "node:path";
import {
  generateSigningKey,
  openBundle,
  privateKeyFromPem,
  rawPublicKey,
  signBundle,
} from "./bundle.ts";
import { validatePayload } from "./validate.ts";
import type { BundlePayload } from "./types.ts";

/** DER header of an Ed25519 public key (SPKI), base64, so a raw 32-byte key can be wrapped. */
const ED25519_SPKI_PREFIX = "MCowBQYDK2VwAyEA";

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const need = (name: string) => {
  const v = flag(name);
  if (!v) throw new Error(`missing --${name}`);
  return v;
};
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8")) as unknown;

function assemble(dir: string, version: number): BundlePayload {
  const part = (name: string) => readJson(path.join(dir, `${name}.json`));
  return {
    schema_version: 1,
    bundle_version: version,
    created_at: new Date().toISOString(),
    taxonomy: part("taxonomy"),
    goals: part("goals"),
    accommodations: part("accommodations"),
    phrases: part("phrases"),
  } as BundlePayload;
}

switch (cmd) {
  case "gen-key": {
    // The private key goes to a path you choose, outside the repository. Only the public key is committed.
    const { privateKey, publicKey, keyId } = generateSigningKey();
    writeFileSync(need("private"), privateKey.export({ format: "pem", type: "pkcs8" }) as string, {
      mode: 0o600,
    });
    console.log(
      JSON.stringify({ key_id: keyId, public_key: rawPublicKey(publicKey).toString("base64") }),
    );
    break;
  }
  case "check": {
    // Drafts are expected until specialists approve them; `build` still refuses anything unpublished.
    const issues = validatePayload(assemble(need("content"), 1), {
      allowDraft: rest.includes("--allow-draft"),
    });
    for (const i of issues) console.error(`${i.path} ${i.code}`);
    if (issues.length > 0) process.exit(1);
    console.log("content ok");
    break;
  }
  case "build": {
    const payload = assemble(need("content"), Number(need("version")));
    const key = privateKeyFromPem(readFileSync(need("key"), "utf8"));
    writeFileSync(need("out"), JSON.stringify(signBundle(payload, key)));
    console.log("bundle written");
    break;
  }
  case "verify": {
    const env = readJson(need("bundle")) as { key_id: string };
    const raw = Buffer.from(need("public-key"), "base64");
    const spki = Buffer.concat([Buffer.from(ED25519_SPKI_PREFIX, "base64"), raw]);
    const pub = createPublicKey({ key: spki, format: "der", type: "spki" });
    const p = openBundle(env, { trustedKeys: { [env.key_id]: pub } });
    console.log(
      `ok: version ${p.bundle_version}, ${p.goals.length} goals, ${p.accommodations.length} accommodations`,
    );
    break;
  }
  default:
    console.error(
      "usage: library-bundle gen-key --private <file> | check --content <dir> | build --content <dir> --key <pem> --version <n> --out <file> | verify --bundle <file> --public-key <b64>",
    );
    process.exit(2);
}
