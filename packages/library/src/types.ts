/**
 * Starter library content model.
 * Library items hold no student data. Starter-tier rows have no tenant and are read-only.
 */

export const GRADE_BANDS = ["EC", "K-2", "3-5", "6-8", "9-12", "18-21"] as const;
export type GradeBand = (typeof GRADE_BANDS)[number];

export const TAXONOMY_LEVELS = ["domain", "area", "skill", "subskill"] as const;
export type TaxonomyLevel = (typeof TAXONOMY_LEVELS)[number];

export const GOAL_AREAS = [
  "reading",
  "written_expression",
  "math",
  "communication",
  "social_emotional",
  "behavior",
  "adaptive",
  "motor",
  "transition",
  "other",
] as const;
export type GoalArea = (typeof GOAL_AREAS)[number];

export const MEASUREMENT_METHODS = [
  "trials",
  "percent_correct",
  "prompt_level",
  "task_analysis",
  "frequency",
  "rate",
  "duration",
  "latency",
  "rubric",
  "yes_no",
  "interval",
  "cbm_probe",
  "gas",
  "anecdotal",
] as const;
export type MeasurementMethod = (typeof MEASUREMENT_METHODS)[number];

export const DISCIPLINES = [
  "sped_teacher",
  "slp",
  "ot",
  "pt",
  "psych",
  "counselor",
  "any",
] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export const ACCOMMODATION_KINDS = [
  "accommodation",
  "modification",
  "testing_accommodation",
  "supplementary_aid",
  "personnel_support",
] as const;
export type AccommodationKind = (typeof ACCOMMODATION_KINDS)[number];

export const PHRASE_PARTS = ["location", "frequency", "duration"] as const;
export type PhrasePart = (typeof PHRASE_PARTS)[number];

/** Only published items ship; drafts exist so content can be validated before specialist review. */
export type ItemStatus = "draft" | "published";

export interface TaxonomyNode {
  id: string;
  parent_id?: string;
  level: TaxonomyLevel;
  name: string;
  goal_area?: GoalArea;
  synonyms: string[];
  sort: number;
}

export interface Provenance {
  /** "original", "adapted_from:<source>" or "district". */
  origin: string;
  author: string;
  reviewer?: string;
  reviewed_on?: string;
}

export interface Slot {
  name: string;
  kind: "text" | "number" | "choice" | "date";
  default?: string;
  choices?: string[];
  help?: string;
}

export interface Mastery {
  /** The criterion. Omitted when `threshold_from_slot` names a slot that supplies it. */
  threshold?: number | null;
  /**
   * Name of a number slot on the goal whose value is the threshold (for example a target
   * words-correct-per-minute for oral reading fluency, which differs by grade).
   */
  threshold_from_slot?: string;
  /** What the threshold counts, for display: "percent", "words correct per minute". */
  unit?: string;
  comparator: ">=" | "<=";
  window_kind: "consecutive" | "best_of";
  /** Sessions that must meet the threshold ... */
  window_count: number;
  /** ... out of this many (equal to window_count for "consecutive"). */
  window_of: number;
  across?: { kind: "settings" | "adults" | "materials"; count: number };
  prompt_ceiling?: "independent" | "gestural";
  maintenance_check: boolean;
}

export interface GoalTemplate {
  id: string;
  version: number;
  status: ItemStatus;
  tier: "starter";
  skill_ids: string[];
  grade_bands: GradeBand[];
  title: string;
  template_text: string;
  condition_text: string;
  behavior_text: string;
  slots: Slot[];
  measurement_plan_template: {
    method: MeasurementMethod;
    secondary_method?: MeasurementMethod;
    unit?: string;
    trials_per_session?: number;
    prompt_hierarchy?: string[];
    task_steps?: string[];
    interval_seconds?: number;
    probe_seconds?: number;
    rubric_levels?: string[];
  };
  mastery: Mastery;
  objective_ladder: string[];
  /**
   * Replacement-behavior wording ("instead of ...") must be tied to the student's FBA and BIP;
   * the attach flow asks the teacher to confirm both exist.
   */
  requires_fba_bip?: boolean;
  baseline_guidance?: string;
  /** Goal checklist: which areas of the curriculum the goal addresses. */
  iep_addresses?: string[];
  /** Goal checklist: how progress toward the goal is measured. */
  progress_measured_by?: string[];
  standard_refs: string[];
  deficit_tags: string[];
  related_accommodation_ids: string[];
  discipline: Discipline;
  provenance: Provenance;
}

export interface AccommodationTemplate {
  id: string;
  version: number;
  status: ItemStatus;
  tier: "starter";
  kind: AccommodationKind;
  category: string;
  title: string;
  description: string;
  need_tags: string[];
  skill_ids: string[];
  assessment_status?: {
    nscas: "allowed" | "designated_support" | "not_allowed" | "check";
    checked_on: string;
  };
  /**
   * Replacement-behavior wording ("instead of ...") must be tied to the student's FBA and BIP;
   * the attach flow asks the teacher to confirm both exist.
   */
  requires_fba_bip?: boolean;
  modification_warning?: string;
  default_lfd: {
    location?: string;
    frequency?: string;
    /** The projected span of the accommodation, such as "for the duration of this IEP". */
    duration?: string;
    /** NDE "duration of service" per occurrence, such as "30 minutes per occurrence". */
    duration_per_occurrence?: string;
  };
  srs_checklist_item?: string;
  srs_504_category?: string;
  srs_504_subject?: string;
  provenance: Provenance;
}

export interface LfdPhrase {
  id: string;
  part: PhrasePart;
  text: string;
  slots: Slot[];
  status: ItemStatus;
}

/** The signed content. Everything the app browses offline, in one document. */
export interface BundlePayload {
  schema_version: 1;
  /** Strictly increases with every release; the app refuses to go backwards. */
  bundle_version: number;
  created_at: string;
  taxonomy: TaxonomyNode[];
  goals: GoalTemplate[];
  accommodations: AccommodationTemplate[];
  phrases: LfdPhrase[];
}

/** What travels and is stored: the payload bytes, base64, and a signature over those exact bytes. */
export interface BundleEnvelope {
  format: "demo-starter-bundle";
  format_version: 1;
  key_id: string;
  algorithm: "ed25519";
  payload: string;
  signature: string;
}
