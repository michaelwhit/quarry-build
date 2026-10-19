import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FieldCrypto } from "../src/crypto/fields.ts";

const crypto = new FieldCrypto(randomBytes(32));
const tenant = randomUUID();
const row = randomUUID();

describe("field encryption", () => {
  it("round-trips and does not leak plaintext", () => {
    const enc = crypto.encrypt(tenant, "student.first_name", row, "Ada");
    expect(enc.includes(Buffer.from("Ada"))).toBe(false);
    expect(crypto.decrypt(tenant, "student.first_name", row, enc)).toBe("Ada");
  });

  it("uses a fresh nonce each time and carries a version and key id", () => {
    const one = crypto.encrypt(tenant, "student.dob", row, "2015-01-01");
    const two = crypto.encrypt(tenant, "student.dob", row, "2015-01-01");
    expect(one.equals(two)).toBe(false);
    expect([one[0], one[1]]).toEqual([2, 1]);
  });

  it("refuses ciphertext moved to another row, column or tenant, or tampered with", () => {
    const enc = crypto.encrypt(tenant, "student.first_name", row, "Ada");
    expect(() => crypto.decrypt(tenant, "student.last_name", row, enc)).toThrow();
    expect(() => crypto.decrypt(randomUUID(), "student.first_name", row, enc)).toThrow();
    expect(() => crypto.decrypt(tenant, "student.first_name", randomUUID(), enc)).toThrow();
    const bad = Buffer.from(enc);
    bad[bad.length - 1] = (bad[bad.length - 1] ?? 0) ^ 1;
    expect(() => crypto.decrypt(tenant, "student.first_name", row, bad)).toThrow();
    expect(() =>
      crypto.decrypt(tenant, "student.first_name", row, Buffer.from([1, 2, 3])),
    ).toThrow();
    const unknownKey = Buffer.from(enc);
    unknownKey[1] = 9;
    expect(() => crypto.decrypt(tenant, "student.first_name", row, unknownKey)).toThrow();
  });

  it("blind indexes match after normalization and differ across tenants", () => {
    const x = crypto.blindIndex(tenant, "student.name", "Ada", "Quill");
    expect(crypto.blindIndex(tenant, "student.name", "  ADA ", "quill").equals(x)).toBe(true);
    expect(crypto.blindIndex(tenant, "student.name", "Ada", "Quil").equals(x)).toBe(false);
    expect(crypto.blindIndex(randomUUID(), "student.name", "Ada", "Quill").equals(x)).toBe(false);
  });

  it("rejects a key of the wrong length", () => {
    expect(() => new FieldCrypto(randomBytes(16))).toThrow(/32 bytes/);
  });
});
