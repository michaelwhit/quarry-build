import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyHidden,
  BundleError,
  generateSigningKey,
  isBlockedFrequency,
  openBundle,
  signBundle,
  validatePayload,
} from "../src/index.ts";
import { samplePayload } from "./fixture.ts";

const a = generateSigningKey();
const b = generateSigningKey();
const trust = { [a.keyId]: a.publicKey };
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as BundleError).code;
  }
  return undefined;
};

describe("starter bundle", () => {
  it("round-trips: sign, then open with the pinned key", () => {
    const env = signBundle(samplePayload(3), a.privateKey);
    const p = openBundle(env, { trustedKeys: trust });
    expect(p.bundle_version).toBe(3);
    expect(p.goals[0]!.title).toBe("Decode CVC words");
  });

  it("refuses a bundle signed by a key the app does not pin", () => {
    const env = signBundle(samplePayload(), b.privateKey);
    expect(codeOf(() => openBundle(env, { trustedKeys: trust }))).toBe("unknown_key");
  });

  it("refuses any change to the payload bytes", () => {
    const env = signBundle(samplePayload(), a.privateKey);
    const bytes = Buffer.from(env.payload, "base64");
    bytes[bytes.indexOf("Decode".charCodeAt(0))] = "X".charCodeAt(0);
    const tampered = { ...env, payload: bytes.toString("base64") };
    expect(codeOf(() => openBundle(tampered, { trustedKeys: trust }))).toBe("signature");
  });

  it("refuses a swapped signature and a key id that claims to be someone else", () => {
    const one = signBundle(samplePayload(1), a.privateKey);
    const two = signBundle(samplePayload(2), a.privateKey);
    expect(
      codeOf(() => openBundle({ ...one, signature: two.signature }, { trustedKeys: trust })),
    ).toBe("signature");
    const forged = signBundle(samplePayload(), b.privateKey);
    expect(codeOf(() => openBundle({ ...forged, key_id: a.keyId }, { trustedKeys: trust }))).toBe(
      "signature",
    );
  });

  it("refuses prototype-chain key ids", () => {
    const env = signBundle(samplePayload(), a.privateKey);
    expect(codeOf(() => openBundle({ ...env, key_id: "__proto__" }, { trustedKeys: trust }))).toBe(
      "unknown_key",
    );
  });

  it("refuses an older or equal version as a rollback, accepts a newer one", () => {
    const env = signBundle(samplePayload(5), a.privateKey);
    expect(codeOf(() => openBundle(env, { trustedKeys: trust, installedVersion: 5 }))).toBe(
      "rollback",
    );
    expect(codeOf(() => openBundle(env, { trustedKeys: trust, installedVersion: 6 }))).toBe(
      "rollback",
    );
    expect(openBundle(env, { trustedKeys: trust, installedVersion: 4 }).bundle_version).toBe(5);
  });

  it("refuses malformed envelopes", () => {
    for (const bad of [
      null,
      {},
      { format: "other" },
      "text",
      { format: "demo-starter-bundle", format_version: 2 },
    ]) {
      expect(codeOf(() => openBundle(bad, { trustedKeys: trust }))).toBe("format");
    }
  });

  it("will not sign content that fails validation", () => {
    const p = samplePayload();
    p.goals[0]!.skill_ids = ["01900000-0000-7000-8000-00000000ffff"];
    expect(() => signBundle(p, a.privateKey)).toThrow(/unknown_skill/);
  });
});

describe("payload validation", () => {
  it("accepts the sample", () => {
    expect(validatePayload(samplePayload())).toEqual([]);
  });

  it("names where and why, never the text", () => {
    const p = samplePayload();
    p.goals[0]!.title = "";
    p.accommodations[0]!.default_lfd.frequency = "as needed SECRET-TEXT";
    p.phrases[0]!.id = p.goals[0]!.id;
    const issues = validatePayload(p);
    expect(issues).toEqual(
      expect.arrayContaining([
        { path: "goals[0].title", code: "missing" },
        { path: "accommodations[0].default_lfd.frequency", code: "blocked_frequency" },
        { path: "phrases[0].id", code: "duplicate_id" },
      ]),
    );
    expect(JSON.stringify(issues)).not.toContain("SECRET-TEXT");
  });

  it("blocks banned frequencies in any casing, in phrases too", () => {
    const p = samplePayload();
    p.phrases.push({
      id: "01900000-0000-7000-8000-000000000031",
      part: "frequency",
      text: "Per Teacher Discretion",
      slots: [],
      status: "published",
    });
    expect(validatePayload(p)).toContainEqual({
      path: "phrases[1].text",
      code: "blocked_frequency",
    });
  });

  it("requires a warning on modifications and a parent for every non-domain node", () => {
    const p = samplePayload();
    p.accommodations[0]!.kind = "modification";
    delete (p.taxonomy[2] as { parent_id?: string }).parent_id;
    const codes = validatePayload(p).map((i) => i.code);
    expect(codes).toContain("missing");
    expect(codes).toContain("unknown_parent");
  });

  it("rejects non-objects without throwing", () => {
    for (const v of [null, 1, "x", [], { goals: "x" }])
      expect(() => validatePayload(v)).not.toThrow();
    expect(validatePayload(null)).toEqual([{ path: "", code: "not_an_object" }]);
  });
});

describe("district hide list", () => {
  it("hides items without touching the signed bundle and drops dangling links", () => {
    const p = samplePayload();
    const hidden = new Set([p.accommodations[0]!.id]);
    const view = applyHidden(p, hidden);
    expect(view.accommodations).toEqual([]);
    expect(view.goals[0]!.related_accommodation_ids).toEqual([]);
    expect(p.accommodations).toHaveLength(1);
    expect(applyHidden(p, new Set()).goals).toEqual(p.goals);
  });
});

// Track 6's shared answer key (PR #14); the same file the Swift lint and the reference tests use.
const vectors = JSON.parse(
  readFileSync(
    new URL("../../synthetic-data/vectors/blocked-frequencies.json", import.meta.url),
    "utf8",
  ),
) as { cases: { name: string; text: string; blocked: boolean }[] };

describe("blocked frequencies", () => {
  it.each(vectors.cases)("shared vector: $name", ({ text, blocked }) => {
    expect(isBlockedFrequency(text)).toBe(blocked);
  });

  it.each([
    "as-needed",
    "As-Needed",
    "PRN-as needed",
    "as_needed",
    "as  needed",
    "as \n needed",
    "when the student says as-needed",
  ])("blocks %j", (text) => {
    expect(isBlockedFrequency(text)).toBe(true);
  });

  it("still allows ordinary frequencies and observable triggers", () => {
    for (const ok of ["daily", "at each transition", "when the student puts head down"])
      expect(isBlockedFrequency(ok)).toBe(false);
  });
});

describe("slot-driven thresholds and NDE detail", () => {
  it("accepts a threshold that comes from a number slot, with a unit", () => {
    const p = samplePayload();
    const g = p.goals[0]!;
    g.slots.push({ name: "target", kind: "number" });
    g.mastery = {
      ...g.mastery,
      threshold: null,
      threshold_from_slot: "target",
      unit: "words correct per minute",
    };
    expect(validatePayload(p)).toEqual([]);
  });

  it("refuses a threshold slot that is missing or not a number slot", () => {
    for (const slot of ["nope", "word_type"]) {
      const p = samplePayload();
      p.goals[0]!.mastery = { ...p.goals[0]!.mastery, threshold: null, threshold_from_slot: slot };
      expect(validatePayload(p)).toContainEqual({ path: "goals[0].mastery", code: "invalid" });
    }
  });

  it("still needs a number when no slot supplies the threshold", () => {
    const p = samplePayload();
    p.goals[0]!.mastery = { ...p.goals[0]!.mastery, threshold: null };
    expect(validatePayload(p)).toContainEqual({ path: "goals[0].mastery", code: "invalid" });
  });

  it("carries the NDE goal checklists and a duration per occurrence apart from the projected span", () => {
    const p = samplePayload();
    p.goals[0]!.iep_addresses = ["Reading"];
    p.goals[0]!.progress_measured_by = ["Curriculum-based probe"];
    p.accommodations[0]!.default_lfd.duration_per_occurrence = "30 minutes per occurrence";
    expect(validatePayload(p)).toEqual([]);
    p.accommodations[0]!.default_lfd.duration_per_occurrence = "";
    expect(validatePayload(p)).toContainEqual({
      path: "accommodations[0].default_lfd.duration_per_occurrence",
      code: "invalid",
    });
  });
});

describe("drafts", () => {
  it("validate with allowDraft but are never signed", () => {
    const p = samplePayload();
    p.goals[0]!.status = "draft";
    expect(validatePayload(p)).toContainEqual({ path: "goals[0].status", code: "not_published" });
    expect(validatePayload(p, { allowDraft: true })).toEqual([]);
    expect(() => signBundle(p, a.privateKey)).toThrow(/not_published/);
  });
});

describe("replacement-behavior flag", () => {
  it("accepts requires_fba_bip on goals and accommodations, and only as a boolean", () => {
    const p = samplePayload();
    p.goals[0]!.requires_fba_bip = true;
    p.accommodations[0]!.requires_fba_bip = true;
    expect(validatePayload(p)).toEqual([]);
    (p.goals[0] as { requires_fba_bip: unknown }).requires_fba_bip = "yes";
    expect(validatePayload(p)).toContainEqual({
      path: "goals[0].requires_fba_bip",
      code: "invalid",
    });
  });
});
