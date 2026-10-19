import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

/**
 * Field encryption and blind indexes for student identifiers.
 *
 * The database only ever sees ciphertext (*_enc) and HMAC blind indexes (*_bidx). Sprint two has
 * no Cloud KMS, so the master key comes from IEP_FIELD_KEY (a local stand-in); the per-tenant
 * keys below are derived from it with HKDF, so swapping in KMS later changes only where the
 * master key comes from.
 *
 * Ciphertext layout: 0x02 | key id | 12-byte nonce | AES-256-GCM ciphertext | 16-byte tag. The
 * tenant id, column label and the id of the row that owns the value are bound as additional
 * authenticated data, so a value moved to another row, another column or another tenant fails
 * to decrypt instead of decrypting to someone else's data. The key id byte lets a rotation add
 * key 2 later without a format change; only key 1 exists today.
 */
const VERSION = 2;
const KEY_ID = 1;
const HEADER_BYTES = 2;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export type FieldLabel =
  | "student.first_name"
  | "student.last_name"
  | "student.preferred_name"
  | "student.local_student_id"
  | "student.state_student_id"
  | "student.dob"
  | "student.disability_categories";

export class FieldCrypto {
  readonly #master: Buffer;

  constructor(masterKey: Buffer) {
    if (masterKey.length !== 32) throw new Error("field key must be 32 bytes");
    this.#master = masterKey;
  }

  /** Reads a base64 32-byte key, for example from `openssl rand -base64 32`. */
  static fromBase64(value: string): FieldCrypto {
    return new FieldCrypto(Buffer.from(value, "base64"));
  }

  #key(tenantId: string, purpose: "enc" | "bidx"): Buffer {
    return Buffer.from(hkdfSync("sha256", this.#master, tenantId, `iep-field-${purpose}-v1`, 32));
  }

  #aad(tenantId: string, label: FieldLabel, rowId: string): Buffer {
    return Buffer.from(`${tenantId}|${label}|${rowId.toLowerCase()}`);
  }

  /** `rowId` is the id of the row the value will be stored in (the student id). */
  encrypt(tenantId: string, label: FieldLabel, rowId: string, plaintext: string): Buffer {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.#key(tenantId, "enc"), nonce, {
      authTagLength: TAG_BYTES,
    });
    cipher.setAAD(this.#aad(tenantId, label, rowId));
    const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return Buffer.concat([Buffer.from([VERSION, KEY_ID]), nonce, body, cipher.getAuthTag()]);
  }

  decrypt(tenantId: string, label: FieldLabel, rowId: string, value: Buffer): string {
    if (
      value.length < HEADER_BYTES + NONCE_BYTES + TAG_BYTES ||
      value[0] !== VERSION ||
      value[1] !== KEY_ID
    ) {
      throw new Error("unrecognized ciphertext");
    }
    const nonce = value.subarray(HEADER_BYTES, HEADER_BYTES + NONCE_BYTES);
    const tag = value.subarray(value.length - TAG_BYTES);
    const body = value.subarray(HEADER_BYTES + NONCE_BYTES, value.length - TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", this.#key(tenantId, "enc"), nonce, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(this.#aad(tenantId, label, rowId));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  }

  /** Deterministic lookup value. Normalized so "  Ada " and "ada" match. */
  blindIndex(tenantId: string, label: FieldLabel | "student.name", ...parts: string[]): Buffer {
    const normalized = parts.map((p) => p.normalize("NFKC").trim().toLowerCase()).join("\u0000");
    return createHmac("sha256", this.#key(tenantId, "bidx"))
      .update(`${label}\u0000${normalized}`)
      .digest();
  }
}
