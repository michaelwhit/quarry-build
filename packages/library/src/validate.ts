import {
  ACCOMMODATION_KINDS,
  DISCIPLINES,
  GOAL_AREAS,
  GRADE_BANDS,
  MEASUREMENT_METHODS,
  PHRASE_PARTS,
  TAXONOMY_LEVELS,
  type BundlePayload,
} from "./types.ts";

export interface ValidationIssue {
  /** Where, like `goals[3].skill_ids`. Never the offending text. */
  path: string;
  code: string;
}

const BLOCKED_PHRASES =
  /\b(as needed|as necessary|when appropriate|prn|if needed|per teacher discretion)\b/;

/**
 * Frequency wording the spec bans (section 7.2), checked on the whole typed text. Case does not
 * matter, and hyphens, underscores and runs of whitespace (including line breaks) count as one
 * space, so "as-needed" and "as\n needed" do not slip past (rule decision BF-1, BF-2). Also used by
 * the curator lint.
 */
export function isBlockedFrequency(text: string): boolean {
  return BLOCKED_PHRASES.test(
    text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\s_-]+/g, " "),
  );
}

/** A mastery threshold is a number, or the name of a number slot on the same goal. */
function thresholdOk(mastery: Record<string, unknown>, slots: unknown): boolean {
  const fromSlot = mastery["threshold_from_slot"];
  if (fromSlot === undefined) return Number.isFinite(mastery["threshold"]);
  if (typeof fromSlot !== "string" || !Array.isArray(slots)) return false;
  return slots.some((s) => isObj(s) && s["name"] === fromSlot && s["kind"] === "number");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => nonEmpty(s));
const oneOf = (list: readonly string[], v: unknown) => typeof v === "string" && list.includes(v);

/**
 * Structural check of a bundle payload: shape, enums, references between records and uniqueness.
 * Reports where and why, never what, so a content mistake cannot leak text into logs. Quality
 * rules for wording (vague verbs, readability) are the curator lint, not this.
 */
export function validatePayload(
  input: unknown,
  options: { allowDraft?: boolean } = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const bad = (path: string, code: string) => issues.push({ path, code });
  const statusOk = (status: unknown) =>
    status === "published" || (options.allowDraft === true && status === "draft");
  if (!isObj(input)) return [{ path: "", code: "not_an_object" }];
  const p = input;
  if (p["schema_version"] !== 1) bad("schema_version", "unsupported");
  if (!Number.isSafeInteger(p["bundle_version"]) || (p["bundle_version"] as number) < 1)
    bad("bundle_version", "invalid");
  if (!nonEmpty(p["created_at"]) || Number.isNaN(Date.parse(p["created_at"] as string)))
    bad("created_at", "invalid");

  const list = (key: string): unknown[] => {
    const v = p[key];
    if (!Array.isArray(v)) {
      bad(key, "not_a_list");
      return [];
    }
    return v;
  };
  const seen = new Set<string>();
  const unique = (path: string, id: unknown) => {
    if (typeof id !== "string" || !UUID.test(id)) return bad(`${path}.id`, "invalid_id");
    if (seen.has(id)) bad(`${path}.id`, "duplicate_id");
    seen.add(id);
  };

  const nodes = new Map<string, Record<string, unknown>>();
  list("taxonomy").forEach((n, i) => {
    const at = `taxonomy[${i}]`;
    if (!isObj(n)) return bad(at, "not_an_object");
    unique(at, n["id"]);
    if (typeof n["id"] === "string") nodes.set(n["id"], n);
    if (!oneOf(TAXONOMY_LEVELS, n["level"])) bad(`${at}.level`, "invalid");
    if (!nonEmpty(n["name"])) bad(`${at}.name`, "missing");
    if (n["goal_area"] !== undefined && !oneOf(GOAL_AREAS, n["goal_area"]))
      bad(`${at}.goal_area`, "invalid");
    if (!Array.isArray(n["synonyms"])) bad(`${at}.synonyms`, "not_a_list");
    if (!Number.isFinite(n["sort"])) bad(`${at}.sort`, "invalid");
  });
  for (const [id, n] of nodes) {
    const parent = n["parent_id"];
    if (n["level"] === "domain") {
      if (parent !== undefined) bad(`taxonomy[${id}].parent_id`, "domain_has_parent");
    } else if (typeof parent !== "string" || !nodes.has(parent)) {
      bad(`taxonomy[${id}].parent_id`, "unknown_parent");
    }
  }
  const skillExists = (id: unknown) => typeof id === "string" && nodes.has(id);

  const accIds = new Set<string>();
  const accommodations = list("accommodations");
  for (const a of accommodations) if (isObj(a) && typeof a["id"] === "string") accIds.add(a["id"]);

  list("goals").forEach((g, i) => {
    const at = `goals[${i}]`;
    if (!isObj(g)) return bad(at, "not_an_object");
    unique(at, g["id"]);
    if (!Number.isSafeInteger(g["version"]) || (g["version"] as number) < 1)
      bad(`${at}.version`, "invalid");
    if (!statusOk(g["status"])) bad(`${at}.status`, "not_published");
    if (g["tier"] !== "starter") bad(`${at}.tier`, "not_starter");
    if (!Array.isArray(g["skill_ids"]) || g["skill_ids"].length === 0)
      bad(`${at}.skill_ids`, "missing");
    else if (!g["skill_ids"].every(skillExists)) bad(`${at}.skill_ids`, "unknown_skill");
    if (
      !Array.isArray(g["grade_bands"]) ||
      g["grade_bands"].length === 0 ||
      !g["grade_bands"].every((b) => oneOf(GRADE_BANDS, b))
    )
      bad(`${at}.grade_bands`, "invalid");
    for (const f of ["title", "template_text", "condition_text", "behavior_text"])
      if (!nonEmpty(g[f])) bad(`${at}.${f}`, "missing");
    const m = g["measurement_plan_template"];
    if (!isObj(m) || !oneOf(MEASUREMENT_METHODS, m["method"]))
      bad(`${at}.measurement_plan_template.method`, "invalid");
    const mastery = g["mastery"];
    if (
      !isObj(mastery) ||
      !thresholdOk(mastery, g["slots"]) ||
      !oneOf([">=", "<="], mastery["comparator"]) ||
      !oneOf(["consecutive", "best_of"], mastery["window_kind"]) ||
      !Number.isSafeInteger(mastery["window_count"]) ||
      !Number.isSafeInteger(mastery["window_of"]) ||
      (mastery["window_count"] as number) < 1 ||
      (mastery["window_of"] as number) < (mastery["window_count"] as number) ||
      typeof mastery["maintenance_check"] !== "boolean"
    )
      bad(`${at}.mastery`, "invalid");
    if (g["requires_fba_bip"] !== undefined && typeof g["requires_fba_bip"] !== "boolean")
      bad(`${at}.requires_fba_bip`, "invalid");
    for (const f of ["iep_addresses", "progress_measured_by"])
      if (g[f] !== undefined && !strings(g[f])) bad(`${at}.${f}`, "invalid");
    if (!strings(g["objective_ladder"])) bad(`${at}.objective_ladder`, "invalid");
    if (!strings(g["deficit_tags"])) bad(`${at}.deficit_tags`, "invalid");
    if (!strings(g["standard_refs"])) bad(`${at}.standard_refs`, "invalid");
    if (!Array.isArray(g["slots"])) bad(`${at}.slots`, "not_a_list");
    if (!oneOf(DISCIPLINES, g["discipline"])) bad(`${at}.discipline`, "invalid");
    const rel = g["related_accommodation_ids"];
    if (!Array.isArray(rel) || !rel.every((id) => typeof id === "string" && accIds.has(id)))
      bad(`${at}.related_accommodation_ids`, "unknown_accommodation");
    if (
      !isObj(g["provenance"]) ||
      !nonEmpty(g["provenance"]["origin"]) ||
      !nonEmpty(g["provenance"]["author"])
    )
      bad(`${at}.provenance`, "missing");
  });

  accommodations.forEach((a, i) => {
    const at = `accommodations[${i}]`;
    if (!isObj(a)) return bad(at, "not_an_object");
    unique(at, a["id"]);
    if (!statusOk(a["status"])) bad(`${at}.status`, "not_published");
    if (a["tier"] !== "starter") bad(`${at}.tier`, "not_starter");
    if (!oneOf(ACCOMMODATION_KINDS, a["kind"])) bad(`${at}.kind`, "invalid");
    for (const f of ["category", "title", "description"])
      if (!nonEmpty(a[f])) bad(`${at}.${f}`, "missing");
    if (!strings(a["need_tags"])) bad(`${at}.need_tags`, "invalid");
    if (!Array.isArray(a["skill_ids"]) || !a["skill_ids"].every(skillExists))
      bad(`${at}.skill_ids`, "unknown_skill");
    if (a["requires_fba_bip"] !== undefined && typeof a["requires_fba_bip"] !== "boolean")
      bad(`${at}.requires_fba_bip`, "invalid");
    if (a["kind"] === "modification" && !nonEmpty(a["modification_warning"]))
      bad(`${at}.modification_warning`, "missing");
    const lfd = a["default_lfd"];
    if (!isObj(lfd)) bad(`${at}.default_lfd`, "missing");
    else if (
      lfd["duration_per_occurrence"] !== undefined &&
      !nonEmpty(lfd["duration_per_occurrence"])
    )
      bad(`${at}.default_lfd.duration_per_occurrence`, "invalid");
    if (isObj(lfd) && typeof lfd["frequency"] === "string" && isBlockedFrequency(lfd["frequency"]))
      bad(`${at}.default_lfd.frequency`, "blocked_frequency");
    if (
      !isObj(a["provenance"]) ||
      !nonEmpty(a["provenance"]["origin"]) ||
      !nonEmpty(a["provenance"]["author"])
    )
      bad(`${at}.provenance`, "missing");
  });

  list("phrases").forEach((ph, i) => {
    const at = `phrases[${i}]`;
    if (!isObj(ph)) return bad(at, "not_an_object");
    unique(at, ph["id"]);
    if (!oneOf(PHRASE_PARTS, ph["part"])) bad(`${at}.part`, "invalid");
    if (!nonEmpty(ph["text"])) bad(`${at}.text`, "missing");
    else if (ph["part"] === "frequency" && isBlockedFrequency(ph["text"] as string))
      bad(`${at}.text`, "blocked_frequency");
    if (!statusOk(ph["status"])) bad(`${at}.status`, "not_published");
  });
  return issues;
}

export function assertValid(payload: unknown): asserts payload is BundlePayload {
  const issues = validatePayload(payload);
  if (issues.length > 0) {
    throw new Error(
      `Invalid library payload: ${issues
        .slice(0, 20)
        .map((i) => `${i.path} ${i.code}`)
        .join("; ")}`,
    );
  }
}
