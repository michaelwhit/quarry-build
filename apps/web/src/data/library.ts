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
  /** Smaller steps toward the goal, easiest first. */
  objective_ladder: string[];
  /** Ids of accommodations that usually go with this goal. */
  related_accommodation_ids: string[];
  /** Replacement-behavior wording must be tied to the student's behavior plan. */
  requires_fba_bip?: boolean;
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
    objective_ladder: ["Read 5 of 10 words", "Read 7 of 10 words", "Read 8 of 10 words"],
    related_accommodation_ids: ["a-aloud"],
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
    objective_ladder: [
      "Read a short passage with prompting",
      "Read a passage at half the target speed",
      "Read at the target speed with help",
    ],
    related_accommodation_ids: ["a-time", "a-notes"],
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
    objective_ladder: [
      "Write a sentence with help",
      "Write a sentence from a picture",
      "Write a sentence alone",
    ],
    related_accommodation_ids: ["a-organizer"],
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
    objective_ladder: ["Add within 5", "Add within 10", "Add within 20"],
    related_accommodation_ids: ["a-visual"],
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
    objective_ladder: ["Ask after a model", "Ask after a gesture", "Ask alone"],
    related_accommodation_ids: ["a-breaks"],
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
    objective_ladder: [
      "Use a strategy with a reminder",
      "Use a strategy after a gesture",
      "Use a strategy alone",
    ],
    related_accommodation_ids: ["a-breaks", "a-seat"],
    requires_fba_bip: true,
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
    objective_ladder: ["Complete 2 steps", "Complete 3 steps", "Complete all 4 steps"],
    related_accommodation_ids: ["a-visual"],
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
    objective_ladder: ["Ask after a model", "Ask after a gesture", "Ask alone"],
    related_accommodation_ids: ["a-seat"],
  },
  {
    id: "g-multiply",
    title: "Solve multiplication facts",
    area: "math",
    grade_bands: ["3-5"],
    template_text:
      "Given a page of multiplication facts through {limit}, {student} will answer each fact with 90 percent accuracy in 3 of 4 checks by {date}.",
    condition_text: "Given a page of multiplication facts through {limit}",
    behavior_text: "answer each fact",
    slots: [{ name: "limit", kind: "choice", choices: ["5", "10", "12"], default: "10" }, dateSlot],
    mastery: m(90, "percent", 3, 4, "best_of"),
    method: "percent_correct",
    type: "percent_correct",
    unit: "percent",
    target_value: 90,
    trials_per_session: null,
    prompt_hierarchy: [],
    task_steps: [],
    baseline_guidance: "Give a timed page on three different days.",
    objective_ladder: ["Facts through 2", "Facts through 5", "Facts through 10"],
    related_accommodation_ids: ["a-calc"],
  },
  {
    id: "g-onTask",
    title: "Stay on task",
    area: "behavior",
    grade_bands: ["K-2", "3-5", "6-8"],
    template_text:
      "During independent work, {student} will stay on task for {minutes} minutes in 4 of 5 observed sessions by {date}.",
    condition_text: "During independent work",
    behavior_text: "stay on task",
    slots: [{ name: "minutes", kind: "number", help: "A plain number, such as 10" }, dateSlot],
    mastery: m(80, "percent", 4, 5, "best_of"),
    method: "duration",
    type: "duration",
    unit: "minutes",
    target_value: 10,
    trials_per_session: null,
    prompt_hierarchy: [],
    task_steps: [],
    baseline_guidance: "Time three independent-work periods before writing the baseline.",
    objective_ladder: [
      "Stay on task for 3 minutes",
      "Stay on task for 6 minutes",
      "Stay on task for 10 minutes",
    ],
    related_accommodation_ids: ["a-breaks", "a-chunk", "a-seat"],
    requires_fba_bip: true,
  },
  {
    id: "g-scissors",
    title: "Cut along a line with scissors",
    area: "motor",
    grade_bands: ["EC", "K-2"],
    template_text:
      "Given a page with a {line_type} line, {student} will cut along the line staying within a quarter inch in 4 of 5 trials by {date}.",
    condition_text: "Given a page with a {line_type} line",
    behavior_text: "cut along the line",
    slots: [
      {
        name: "line_type",
        kind: "choice",
        choices: ["straight", "curved", "zigzag"],
        default: "straight",
      },
      dateSlot,
    ],
    mastery: m(80, "percent", 4, 5, "best_of"),
    method: "trials",
    type: "trials",
    unit: "trials",
    target_value: 4,
    trials_per_session: 5,
    prompt_hierarchy: [],
    task_steps: [],
    baseline_guidance: "Try five cuts on three different days.",
    objective_ladder: ["Snip paper", "Cut a straight line with help", "Cut a straight line alone"],
    related_accommodation_ids: [],
  },
  {
    id: "g-jobs",
    title: "Name steps to a job interest",
    area: "transition",
    grade_bands: ["9-12", "18-21"],
    template_text:
      "Given a list of jobs, {student} will name 3 steps needed to work in one job of interest in 3 of 3 sessions by {date}.",
    condition_text: "Given a list of jobs",
    behavior_text: "name 3 steps needed to work in one job of interest",
    slots: [dateSlot],
    mastery: m(100, "percent", 3, 3),
    method: "yes_no",
    type: "yes_no",
    unit: "",
    target_value: 1,
    trials_per_session: null,
    prompt_hierarchy: [],
    task_steps: [],
    baseline_guidance: "Ask the student to name steps for a job of interest and note what is said.",
    objective_ladder: ["Name one job", "Name one step with help", "Name three steps"],
    related_accommodation_ids: ["a-notes"],
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
  {
    id: "a-calc",
    title: "Calculator for multi-step math",
    kind: "accommodation",
    category: "Response",
    description:
      "The student may use a basic calculator on multi-step problems that are not testing computation.",
    location: "In the general education classroom",
    frequency: "On multi-step math work",
    duration: "For the duration of this plan",
  },
  {
    id: "a-notes",
    title: "Copy of class notes",
    kind: "supplementary_aid",
    category: "Organization",
    description:
      "The student receives a copy of the teacher's notes or an outline after each lesson.",
    location: "In the general education classroom",
    frequency: "After each lesson",
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
