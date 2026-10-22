import type { GoalArea } from "@synthetic/src/types.ts";
import type { GradeBand } from "./library.ts";

// A small sample strategy library for the practice app. Every item is original, made-up wording
// written only for practice. It has not been reviewed by a specialist and is not district content.

/** 1 = whole class, 2 = small group, 3 = one-to-one. */
export type Tier = 1 | 2 | 3;

/** The three Universal Design for Learning groups. */
export type Udl = "representation" | "action_expression" | "engagement";

export const UDL_LABEL: Record<Udl, string> = {
  representation: "Ways to take in information",
  action_expression: "Ways to show what you know",
  engagement: "Ways to stay interested",
};

export const TIER_LABEL: Record<Tier, string> = {
  1: "Whole class",
  2: "Small group",
  3: "One to one",
};

export interface StrategyItem {
  id: string;
  title: string;
  area: GoalArea;
  tier: Tier;
  udl: Udl;
  grade_bands: GradeBand[];
  description: string;
  /** What the adult does, in order. */
  steps: string[];
  /** What to look for to know it is working or should change. */
  watch_for: string;
}

const s = (
  id: string,
  title: string,
  area: GoalArea,
  tier: Tier,
  udl: Udl,
  grade_bands: GradeBand[],
  description: string,
  steps: string[],
  watch_for: string,
): StrategyItem => ({ id, title, area, tier, udl, grade_bands, description, steps, watch_for });

export const strategies: StrategyItem[] = [
  s(
    "s-echo",
    "Echo reading with a short passage",
    "reading",
    2,
    "representation",
    ["K-2", "3-5"],
    "The adult reads a line, then the student reads the same line back.",
    [
      "Pick a passage the student can nearly read.",
      "Read one line aloud.",
      "The student reads it back.",
    ],
    "Fewer pauses on repeat words across a week of passages.",
  ),
  s(
    "s-word-sort",
    "Sort words by sound pattern",
    "reading",
    2,
    "representation",
    ["K-2"],
    "The student sorts word cards into piles by the sound they share.",
    [
      "Lay out three header words.",
      "Student places each card under a header.",
      "Read each pile aloud.",
    ],
    "The student explains why a card belongs, not just where it goes.",
  ),
  s(
    "s-sentence-frame",
    "Sentence frames for writing",
    "written_expression",
    1,
    "action_expression",
    ["K-2", "3-5"],
    "Starter phrases give a student a way into a sentence.",
    [
      "Post two or three frames.",
      "Student picks one and finishes it.",
      "Fade frames as writing grows.",
    ],
    "The student starts writing without a long wait.",
  ),
  s(
    "s-draw-plan",
    "Draw, then write",
    "written_expression",
    2,
    "action_expression",
    ["K-2", "3-5"],
    "A quick sketch holds ideas before the student writes about them.",
    ["Sketch the idea in two minutes.", "Label the sketch.", "Turn the labels into sentences."],
    "More ideas in the writing than in writing done without a sketch.",
  ),
  s(
    "s-number-line",
    "Number line jumps",
    "math",
    2,
    "representation",
    ["K-2", "3-5"],
    "The student counts on or back along a drawn number line.",
    [
      "Draw a line with the start number marked.",
      "Jump forward or back.",
      "Say the landing number.",
    ],
    "The student starts to skip the drawing and say the answer.",
  ),
  s(
    "s-worked-example",
    "Worked example, then try one",
    "math",
    1,
    "representation",
    ["3-5", "6-8"],
    "Show one solved problem step by step, then give a matching problem.",
    ["Solve one problem aloud.", "Leave the steps posted.", "Student solves a matching problem."],
    "The student can say which step comes next without looking.",
  ),
  s(
    "s-choice-board",
    "Choice board for showing learning",
    "other",
    1,
    "action_expression",
    ["3-5", "6-8", "9-12"],
    "A short menu of ways to show the same learning.",
    ["Offer three options.", "Student picks one.", "Use the same checklist for all options."],
    "The student finishes work that was often left undone.",
  ),
  s(
    "s-visual-schedule",
    "Visual schedule",
    "adaptive",
    2,
    "representation",
    ["EC", "K-2"],
    "Pictures or words show what happens next in the day.",
    [
      "Post the order of the day.",
      "Point to it at each change.",
      "Student moves a marker when done.",
    ],
    "Fewer upset moments at changes.",
  ),
  s(
    "s-first-then",
    "First, then",
    "behavior",
    2,
    "engagement",
    ["EC", "K-2", "3-5"],
    "A two-part card shows the task first and a chosen reward second.",
    [
      "Show the card before the task.",
      "Keep the first part short.",
      "Give the second part right away.",
    ],
    "The student starts the first part with fewer reminders.",
  ),
  s(
    "s-break-card",
    "Break card",
    "behavior",
    2,
    "engagement",
    ["K-2", "3-5", "6-8"],
    "The student hands over a card to ask for a short, planned break.",
    ["Teach what the card means.", "Set a timer for the break.", "Return to the same task."],
    "The student asks before the stress builds, not after.",
  ),
  s(
    "s-feelings-check",
    "Feelings check-in",
    "social_emotional",
    1,
    "engagement",
    ["EC", "K-2", "3-5"],
    "A quick start-of-day check using a chart of faces or words.",
    ["Student points to a feeling.", "Adult says what they notice.", "Offer one calming choice."],
    "The student starts to name feelings without the chart.",
  ),
  s(
    "s-role-play",
    "Practice with role play",
    "social_emotional",
    3,
    "action_expression",
    ["3-5", "6-8", "9-12"],
    "The adult and student act out a tricky moment and try a new reply.",
    ["Name the moment.", "Act it out once.", "Swap parts and try again."],
    "The student uses the new reply in real moments.",
  ),
  s(
    "s-aac-model",
    "Model on the device",
    "communication",
    3,
    "representation",
    ["EC", "K-2", "3-5"],
    "The adult touches the words on the student's device while speaking.",
    ["Say the word and touch it.", "Pause and wait.", "Welcome any try."],
    "More touches by the student without being asked.",
  ),
  s(
    "s-wait-time",
    "Wait time",
    "communication",
    1,
    "engagement",
    ["EC", "K-2", "3-5", "6-8"],
    "Count to five in your head before helping or asking again.",
    ["Ask once.", "Wait five slow counts.", "Then repeat or give a hint."],
    "The student replies more often during the wait.",
  ),
  s(
    "s-grip-play",
    "Grip building through play",
    "motor",
    2,
    "action_expression",
    ["EC", "K-2"],
    "Short games with tongs, clips and putty build hand strength.",
    ["Set up a game with small items.", "Play for five minutes.", "Try a pencil right after."],
    "The student holds a pencil longer before tiring.",
  ),
  s(
    "s-task-analysis",
    "Break a routine into steps",
    "adaptive",
    3,
    "representation",
    ["K-2", "3-5", "6-8", "9-12", "18-21"],
    "A daily skill is split into small steps taught one at a time.",
    ["List the steps in order.", "Teach the last step first.", "Add one earlier step at a time."],
    "The student does more steps with less help each week.",
  ),
  s(
    "s-job-shadow",
    "Job shadow log",
    "transition",
    2,
    "engagement",
    ["9-12", "18-21"],
    "The student visits a workplace and records what the job needs.",
    ["Pick a workplace together.", "Student fills a short log.", "Talk about fit afterward."],
    "The student can name two skills the job needs.",
  ),
  s(
    "s-self-monitor",
    "Self-check checklist",
    "other",
    2,
    "action_expression",
    ["3-5", "6-8", "9-12"],
    "The student ticks a short list at the end of a task.",
    [
      "Write three check items together.",
      "Student ticks when done.",
      "Compare with the adult's view.",
    ],
    "The student's ticks match the adult's view more often.",
  ),
];

export const strategyById = (id: string) => strategies.find((x) => x.id === id);
