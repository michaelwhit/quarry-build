import type { BundlePayload } from "../src/types.ts";

const ID = (n: number) => `01900000-0000-7000-8000-${String(n).padStart(12, "0")}`;

/** A tiny, original-wording payload for tests. Real content comes from the content track (C-1, C-2). */
export function samplePayload(version = 1): BundlePayload {
  const provenance = { origin: "original", author: "test fixture" };
  return {
    schema_version: 1,
    bundle_version: version,
    created_at: "2026-10-18T00:00:00Z",
    taxonomy: [
      { id: ID(1), level: "domain", name: "Academic", synonyms: [], sort: 1 },
      {
        id: ID(2),
        parent_id: ID(1),
        level: "area",
        name: "Reading",
        goal_area: "reading",
        synonyms: [],
        sort: 1,
      },
      {
        id: ID(3),
        parent_id: ID(2),
        level: "skill",
        name: "Phonics and decoding",
        goal_area: "reading",
        synonyms: ["sounding out"],
        sort: 1,
      },
    ],
    goals: [
      {
        id: ID(10),
        version: 1,
        status: "published",
        tier: "starter",
        skill_ids: [ID(3)],
        grade_bands: ["K-2"],
        title: "Decode CVC words",
        template_text:
          "Given a list of {word_type} words, the student will read each word aloud with {accuracy} percent accuracy in 3 of 3 consecutive sessions by {date}.",
        condition_text: "Given a list of {word_type} words",
        behavior_text: "read each word aloud",
        slots: [{ name: "word_type", kind: "choice", choices: ["CVC", "CVCe"], default: "CVC" }],
        measurement_plan_template: { method: "trials", unit: "words", trials_per_session: 10 },
        mastery: {
          threshold: 80,
          comparator: ">=",
          window_kind: "consecutive",
          window_count: 3,
          window_of: 3,
          maintenance_check: true,
        },
        objective_ladder: ["Read 5 of 10 words", "Read 7 of 10 words"],
        baseline_guidance: "Give three 1-minute probes before writing the baseline.",
        standard_refs: [],
        deficit_tags: ["phonological_processing_low"],
        related_accommodation_ids: [ID(20)],
        discipline: "sped_teacher",
        provenance,
      },
    ],
    accommodations: [
      {
        id: ID(20),
        version: 1,
        status: "published",
        tier: "starter",
        kind: "accommodation",
        category: "Presentation",
        title: "Directions read aloud",
        description: "Staff read written directions aloud to the student.",
        need_tags: ["decoding_low"],
        skill_ids: [ID(3)],
        default_lfd: {
          location: "all general education classes",
          frequency: "for every written assignment",
          duration: "for the duration of this IEP",
        },
        provenance,
      },
    ],
    phrases: [{ id: ID(30), part: "frequency", text: "daily", slots: [], status: "published" }],
  };
}
