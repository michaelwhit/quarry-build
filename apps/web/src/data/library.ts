import type { GoalArea, MeasurementType } from "@synthetic/src/types.ts";
import type { DraftTemplate, Mastery, Slot } from "./libraryText.ts";

// A small sample library for the practice app. Every item is original, made-up wording written only
// for practice. It has not been reviewed by a specialist and is not district content.

export const GRADE_BANDS = ["EC", "K-2", "3-5", "6-8", "9-12", "18-21"] as const;
export type GradeBand = (typeof GRADE_BANDS)[number];

export interface GoalItem extends DraftTemplate {
  id: string;
  title: string;
  area: GoalArea;
  grade_bands: GradeBand[];
  /** The measurement type the web app records this goal with. */
  type: MeasurementType;
  unit: string;
  target_value: number | "from_slot";
  target_slot?: string;
  trials_per_session: number | null;
  prompt_hierarchy: string[];
  task_steps: string[];
  baseline_guidance: string;
}

const m = (
  threshold: number | null,
  unit: string,
  count: number,
  of: number,
  kind: Mastery["window_kind"] = "consecutive",
  extra: Partial<Mastery> = {},
): Mastery => ({
  threshold,
  unit,
  comparator: ">=",
  window_kind: kind,
  window_count: count,
  window_of: of,
  maintenance_check: true,
  ...extra,
});

const dateSlot: Slot = { name: "date", kind: "date" };

export const goals: GoalItem[] = [
  {
    id: "g-cvc",
    title: "Read short words by sounding them out",
    area: "reading",
    grade_bands: ["K-2"],
    template_text:
      "Given a list of {word_type} words, {student} will read each word aloud with 80 percent accuracy in 3 of 3 consecutive sessions by {date}.",
    condition_text: "Given a list of {word_type} words",
    behavior_text: "read each word aloud",
    slots: [
      { name: "word_type", kind: "choice", choices: ["CVC", "CVCe", "blend"], default: "CVC" },
      dateSlot,
    ],
    mastery: m(80, "percent", 3, 3),
    method: "trials",
    type: "trials",
    unit: "words",
    target_value: 8,
    trials_per_session: 10,
    prompt_hierarchy: [],
    task_steps: [],
    baseline_guidance: "Give three one-minute checks before writing the baseline.",
  },
  {
    id: "g-fluency",
    title: "Read a grade-level passage smoothly",
    area: "reading",
    grade_bands: ["3-5", "6-8"],
    template_text:
      "Given a grade-level passage, {student} will read aloud at {target_wcpm} words correct per minute in 3 of 4 checks by {date}.",
    condition_text: "Given a grade-level passage",
    behavior_text: "read aloud",
    slots: [{ name: "target_wcpm", kind: "number", help: "A plain number, such as 90" }, dateSlot],
    mastery: {
      threshold_from_slot: "target_wcpm",
      unit: "words correct per minute",
      comparator: ">=",
      window_kind: "best_of",
      window_count: 3,
      window_of: 4,
      maintenance_check: true,
    },
    method: "rate",
    type: "rate",
    unit: "words correct per minute",
    target_value: "from_slot",
    target_slot: "target_wcpm",
    trials_per_session: null,
    prompt_hierarchy: [],
    task_steps: [],
    baseline_guidance: "Use the median of three one-minute readings.",
  },
  {
    id: "g-sentence",
    title: "Write a complete sentence",
    area: "written_expression",
    grade_bands: ["K-2", "3-5"],
    template_text:
      "Given a picture or a topic, {student} will write a complete sentence with a capital letter and an end mark with 80 percent accuracy in 3 of 4 samples by {date}.",
    condition_text: "Given a picture or a topic",
    behavior_text: "write a complete sentence",
    slots: [dateSlot],
    mastery: m(80, "percent", 3, 4, "best_of"),
    method: "percent_correct",
    type: "percent_correct",
    unit: "percent",
    target_value: 80,
    trials_per_session: null,
    prompt_hierarchy: [],
    task_steps: [],
    baseline_guidance: "Collect three writing samples before writing the baseline.",
  },
  {
    id: "g-addition",
    title: "Solve one-step addition problems",
    area: "math",
    grade_bands: ["K-2"],
    template_text:
      "Given one-step addition problems within {limit}, {student} will solve each problem with 80 percent accuracy in 3 of 4 checks by {date}.",
    condition_text: "Given one-step addition problems within {limit}",
    behavior_text: "solve each problem",
    slots: [
      { name: "limit", kind: "choice", choices: ["10", "20", "100"], default: "20" },
      dateSlot,
    ],
    mastery: m(80, "percent", 3, 4, "best_of"),
    method: "percent_correct",
    type: "percent_correct",
    unit: "percent",
    target_value: 80,
    trials_per_session: null,
    prompt_hierarchy: [],
    task_steps: [],
    baseline_guidance: "Give a ten-problem check on three different days.",
  },
  {
    id: "g-request",
    title: "Ask for a break",
    area: "communication",
    grade_bands: ["EC", "K-2", "3-5"],
    template_text:
      "When {student} feels overwhelmed in class, {student} will ask for a break using words, a card or a gesture in 4 of 5 opportunities by {date}.",
    condition_text: "When feeling overwhelmed in class",
    behavior_text: "ask for a break using words, a card or a gesture",
    slots: [dateSlot],
    mastery: m(80, "percent", 4, 5, "best_of"),
    method: "trials",
    type: "trials",
    unit: "opportunities",
    target_value: 4,
    trials_per_session: 5,
    prompt_hierarchy: [],
    task_steps: [],
    baseline_guidance: "Note each time a break was needed and how it was asked for, over one week.",
  },
  {
    id: "g-calm",
    title: "Use a calming strategy",
    area: "social_emotional",
    grade_bands: ["3-5", "6-8"],
    template_text:
      "When upset, {student} will use a calming strategy such as {strategy} within 2 minutes in 4 of 5 observed episodes by {date}.",
    condition_text: "When upset",
    behavior_text: "use a calming strategy",
    slots: [
      {
        name: "strategy",
        kind: "choice",
        choices: ["deep breaths", "counting", "asking for space"],
        default: "deep breaths",
      },
      dateSlot,
    ],
    mastery: m(80, "percent", 4, 5, "best_of"),
    method: "trials",
    type: "trials",
    unit: "episodes",
    target_value: 4,
    trials_per_session: 5,
    prompt_hierarchy: [],
    task_steps: [],
    baseline_guidance: "Record the next five episodes before writing the baseline.",
  },
  {
    id: "g-routine",
    title: "Follow a morning routine",
    area: "adaptive",
    grade_bands: ["EC", "K-2", "18-21"],
    template_text:
      "Given a picture checklist, {student} will complete the 4 steps of the arrival routine independently on 4 of 5 school days by {date}.",
    condition_text: "Given a picture checklist",
    behavior_text: "complete the steps of the arrival routine",
    slots: [dateSlot],
    mastery: m(100, "percent", 4, 5, "best_of"),
    method: "task_analysis",
    type: "task_analysis",
    unit: "",
    target_value: 4,
    trials_per_session: null,
    prompt_hierarchy: [],
    task_steps: ["Hang up backpack", "Put lunch in bin", "Take out folder", "Sit at desk"],
    baseline_guidance: "Watch the routine on three days and mark each step done alone.",
  },
  {
    id: "g-help",
    title: "Ask an adult for help",
    area: "communication",
    grade_bands: ["K-2", "3-5", "6-8"],
    template_text:
      "When {student} does not understand a task, {student} will ask an adult for help at the {level} level in 4 of 5 opportunities by {date}.",
    condition_text: "When a task is not understood",
    behavior_text: "ask an adult for help",
    slots: [
      {
        name: "level",
        kind: "choice",
        choices: ["gestural", "verbal", "independent"],
        default: "verbal",
      },
      dateSlot,
    ],
    mastery: m(80, "percent", 4, 5, "best_of"),
    method: "prompt_level",
    type: "prompt_level",
    unit: "",
    target_value: 4,
    trials_per_session: null,
    prompt_hierarchy: [
      "full physical",
      "partial physical",
      "model",
      "gestural",
      "verbal",
      "independent",
    ],
    task_steps: [],
    baseline_guidance: "Note how much prompting is needed over five opportunities.",
  },
];

export interface AccommodationItem {
  id: string;
  title: string;
  kind: "accommodation" | "supplementary_aid" | "testing_accommodation";
  category: string;
  description: string;
  location: string;
  frequency: string;
  duration: string;
}

export const accommodations: AccommodationItem[] = [
  {
    id: "a-time",
    title: "Extra time on tasks",
    kind: "accommodation",
    category: "Timing",
    description:
      "The student may take up to 1.5 times the usual time to finish classwork and tests.",
    location: "In the general education classroom",
    frequency: "On timed work",
    duration: "For the duration of this plan",
  },
  {
    id: "a-aloud",
    title: "Directions read aloud",
    kind: "accommodation",
    category: "Presentation",
    description: "An adult reads written directions aloud and repeats them on request.",
    location: "In the general education classroom",
    frequency: "On written directions",
    duration: "For the duration of this plan",
  },
  {
    id: "a-quiet",
    title: "Quiet space for tests",
    kind: "testing_accommodation",
    category: "Setting",
    description: "The student takes tests in a small, quiet room with fewer distractions.",
    location: "In a small testing room",
    frequency: "On unit tests",
    duration: "For the duration of this plan",
  },
  {
    id: "a-visual",
    title: "Visual schedule",
    kind: "supplementary_aid",
    category: "Organization",
    description: "A picture or word schedule of the day is kept at the student's desk.",
    location: "At the student's desk",
    frequency: "Updated each morning",
    duration: "For the duration of this plan",
  },
  {
    id: "a-organizer",
    title: "Graphic organizer for writing",
    kind: "supplementary_aid",
    category: "Organization",
    description: "The student uses a graphic organizer to plan written work before drafting.",
    location: "In the general education classroom",
    frequency: "On writing tasks",
    duration: "For the duration of this plan",
  },
  {
    id: "a-breaks",
    title: "Short movement breaks",
    kind: "accommodation",
    category: "Behavior support",
    description: "The student may take a two-minute movement break after a long task.",
    location: "In or just outside the classroom",
    frequency: "Up to 3 times a day",
    duration: "For the duration of this plan",
  },
  {
    id: "a-chunk",
    title: "Assignments in smaller parts",
    kind: "accommodation",
    category: "Presentation",
    description: "Long assignments are split into shorter parts, handed out one at a time.",
    location: "In the general education classroom",
    frequency: "On assignments of more than one page",
    duration: "For the duration of this plan",
  },
  {
    id: "a-seat",
    title: "Seat near the teacher",
    kind: "accommodation",
    category: "Setting",
    description: "The student sits near the teacher and away from high-traffic areas.",
    location: "In the general education classroom",
    frequency: "Daily",
    duration: "For the duration of this plan",
  },
];

export const goalAreaLabel: Record<string, string> = {
  reading: "Reading",
  written_expression: "Written expression",
  math: "Math",
  communication: "Communication",
  social_emotional: "Social and emotional",
  behavior: "Behavior",
  adaptive: "Adaptive",
  motor: "Motor",
  transition: "Transition",
  other: "Other",
};

export const kindLabel: Record<AccommodationItem["kind"], string> = {
  accommodation: "Accommodation",
  supplementary_aid: "Supplementary aid",
  testing_accommodation: "Testing accommodation",
};

/** Words a search matches against for a goal or accommodation. */
export const searchText = (title: string, extra: string) => `${title} ${extra}`.toLowerCase();
