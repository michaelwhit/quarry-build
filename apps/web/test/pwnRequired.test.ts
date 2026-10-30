import { describe, expect, it } from "vitest";
import { type BoxId, type PwnInput, copyText, draftPwn } from "../src/data/pwn.ts";

// CI eval set for the Prior Written Notice (required-elements check): twenty invented students, each
// with a complete set of entries. For every one, all the required contents are present when the
// entries are complete, and taking away any one required entry blocks the matching box and the whole
// notice. Invented data from a seeded generator.

const FIRST = [
  "Ansel",
  "Briony",
  "Corwin",
  "Delphine",
  "Emrys",
  "Fenella",
  "Gideon",
  "Halcyon",
  "Isolde",
  "Jorund",
  "Kestrel",
  "Linnea",
  "Merrick",
  "Nerys",
  "Orrin",
  "Perpetua",
  "Quillon",
  "Rosalind",
  "Sorrel",
  "Tamsin",
];
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

const TITLES = [
  "Reading instruction",
  "Speech therapy",
  "Occupational therapy",
  "Extra time on tests",
];
const FREQ = ["4 days/week", "22 days/semester", "2 sessions/month"];
const DUR = ["15 min/day", "30 min/session", "45 min/day"];
const PLACES = ["Resource room", "Speech room", "Library"];
const INSTRUMENTS = ["Oral reading probe", "Math facts probe", "Language sample", "Motor screen"];

function inputFor(i: number): PwnInput {
  const r = rng(3000 + i);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const rows = Array.from({ length: 1 + Math.floor(r() * 3) }, (_, k) => ({
    kind: "special_education" as const,
    title: `${pick(TITLES)} ${k + 1}`,
    change: "added" as const,
    frequency: pick(FREQ),
    duration: pick(DUR),
    location: pick(PLACES),
    start: "2027-01-10",
  }));
  return {
    noteDate: "2027-01-05",
    deliveryDate: "2027-01-07",
    deliveryMethod: "Hand delivered",
    rows,
    goals: [{ area: "Reading fluency", change: "added" }],
    considerations: [
      {
        label: "Assistive technology",
        choice: "considered_not_needed",
        reason: "Current tools meet the need.",
      },
    ],
    esy: { choice: "considered_not_needed", reason: "Skills held steady over the break." },
    alternatives: [
      { option: "General education only", reason: "the data show a need for small groups" },
    ],
    evaluations: [pick(INSTRUMENTS)],
    otherFactors: ["Family prefers morning services."],
    reasons: ["Progress data show the student needs daily practice."],
    contact: { name: "Pat Example", role: "Case manager", phone: "555-0100" },
    helpSource: "The state parent help line",
  };
}

const ALL: BoxId[] = [
  "proposed",
  "refused",
  "why",
  "other_options",
  "evaluation",
  "other_factors",
  "safeguards",
  "help_sources",
  "contact",
];

// Each required entry, how to take it away, and the box that must then be blocked.
const REMOVALS: { name: string; box: BoxId; strip: (x: PwnInput) => void }[] = [
  {
    name: "every service and goal",
    box: "proposed",
    strip: (x) => {
      x.rows = [];
      x.goals = [];
    },
  },
  {
    name: "the teacher's reasons",
    box: "why",
    strip: (x) => {
      x.reasons = [];
    },
  },
  {
    name: "the evaluation instruments",
    box: "evaluation",
    strip: (x) => {
      x.evaluations = [];
    },
  },
  {
    name: "the help source",
    box: "help_sources",
    strip: (x) => {
      delete x.helpSource;
    },
  },
  {
    name: "the contact",
    box: "contact",
    strip: (x) => {
      x.contact = { name: "", role: "" };
    },
  },
  {
    name: "the ESY answer",
    box: "refused",
    strip: (x) => {
      delete x.esy;
    },
  },
];

describe("required elements: complete entries give a complete notice", () => {
  for (let i = 0; i < 20; i++)
    it(`${FIRST[i]}: every required box is present and approvable`, () => {
      const d = draftPwn(inputFor(i));
      expect(d.blocked).toEqual([]);
      expect(d.noteDate).not.toBe("");
      for (const id of ALL) expect(copyText(d, id), id).toBeTruthy();
      expect(d.boxes.map((b) => b.id)).toEqual(ALL);
    });
});

describe("required elements: a missing entry blocks the box and the notice", () => {
  for (let i = 0; i < 20; i++)
    for (const rm of REMOVALS)
      it(`${FIRST[i]}: without ${rm.name}`, () => {
        const x = inputFor(i);
        rm.strip(x);
        const d = draftPwn(x);
        expect(d.blocked.length).toBeGreaterThan(0);
        expect(copyText(d, rm.box), rm.name).toBeNull();
      });
});
