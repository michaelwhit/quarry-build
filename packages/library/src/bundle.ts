import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import type { KeyObject } from "node:crypto";
import { assertValid } from "./validate.ts";
import type { BundleEnvelope, BundlePayload } from "./types.ts";

/** Raw 32-byte Ed25519 public key to a short stable id, so the app can pin keys by id. */
export function keyIdOf(publicKey: KeyObject): string {
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

export function rawPublicKey(publicKey: KeyObject): Buffer {
  return Buffer.from(publicKey.export({ format: "der", type: "spki" }).subarray(-32));
}

/** A throwaway signing key pair. Production signing keys live in the release pipeline, never in the repo. */
export function generateSigningKey(): {
  privateKey: KeyObject;
  publicKey: KeyObject;
  keyId: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return { privateKey, publicKey, keyId: keyIdOf(publicKey) };
}

export function privateKeyFromPem(pem: string): KeyObject {
  return createPrivateKey(pem);
}

/**
 * Validates and signs a payload. The signature covers the exact payload bytes carried in the
 * envelope, so readers never need a canonical JSON form: they verify the bytes, then parse them.
 */
export function signBundle(payload: BundlePayload, privateKey: KeyObject): BundleEnvelope {
  assertValid(payload);
  const bytes = Buffer.from(JSON.stringify(payload), "utf8");
  const publicKey = createPublicKey(privateKey);
  return {
    format: "demo-starter-bundle",
    format_version: 1,
    key_id: keyIdOf(publicKey),
    algorithm: "ed25519",
    payload: bytes.toString("base64"),
    signature: sign(null, bytes, privateKey).toString("base64"),
  };
}

export class BundleError extends Error {
  readonly code: "format" | "unknown_key" | "signature" | "rollback" | "content";
  constructor(code: BundleError["code"]) {
    super(`bundle rejected: ${code}`);
    this.code = code;
  }
}

export interface OpenOptions {
  /** Keys the app trusts, by key id. A bundle signed by any other key is refused. */
  trustedKeys: Record<string, KeyObject>;
  /** Highest bundle_version already installed; an older or equal one is refused as a rollback. */
  installedVersion?: number;
}

/** Verifies an envelope and returns the payload. Throws BundleError with a code, never content. */
export function openBundle(envelope: unknown, options: OpenOptions): BundlePayload {
  const e = envelope as Partial<BundleEnvelope> | null;
  if (
    !e ||
    e.format !== "demo-starter-bundle" ||
    e.format_version !== 1 ||
    e.algorithm !== "ed25519" ||
    typeof e.key_id !== "string" ||
    typeof e.payload !== "string" ||
    typeof e.signature !== "string"
  )
    throw new BundleError("format");
  const key = Object.hasOwn(options.trustedKeys, e.key_id)
    ? options.trustedKeys[e.key_id]
    : undefined;
  if (!key) throw new BundleError("unknown_key");
  const bytes = Buffer.from(e.payload, "base64");
  if (!verify(null, bytes, key, Buffer.from(e.signature, "base64")))
    throw new BundleError("signature");
  let payload: unknown;
  try {
    payload = JSON.parse(bytes.toString("utf8"));
    assertValid(payload);
  } catch {
    throw new BundleError("content");
  }
  const version = (payload as BundlePayload).bundle_version;
  if (options.installedVersion !== undefined && version <= options.installedVersion)
    throw new BundleError("rollback");
  return payload as BundlePayload;
}

/**
 * Applies a district's hide list. Hiding removes an item from browsing and suggestions; the
 * bundle itself is never edited, so the signature stays valid and un-hiding is instant. Phrases
 * and goals that reference hidden accommodations keep working: related links to a hidden item
 * are dropped from the view.
 */
export function applyHidden(
  payload: BundlePayload,
  hiddenItemIds: ReadonlySet<string>,
): BundlePayload {
  const keep = <T extends { id: string }>(items: T[]) =>
    items.filter((i) => !hiddenItemIds.has(i.id));
  const accommodations = keep(payload.accommodations);
  return {
    ...payload,
    goals: keep(payload.goals).map((g) => ({
      ...g,
      related_accommodation_ids: g.related_accommodation_ids.filter((id) => !hiddenItemIds.has(id)),
    })),
    accommodations,
    phrases: keep(payload.phrases),
  };
}
