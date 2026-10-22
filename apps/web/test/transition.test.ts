import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_ASSESSMENTS,
  MAX_TEXT,
  TRANSITION_KEY,
  ageOn,
  clearTransition,
  emptyPlan,
  getTransition,
  isComplete,
  missingPieces,
  needsTransition,
  resetTransitionForTests,
  setTransition,
  useTransitionStorage,
  type TransitionPlan,
} from "../src/data/transition.ts";

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

let mem: MemoryStorage;
beforeEach(() => {
  mem = new MemoryStorage();
  useTransitionStorage(mem);
});

const full = (): TransitionPlan => ({
  goals: { education: "Attend a two-year program.", employment: "Work part time in a shop." },
  assessments: [{ id: "a1", name: "Interest survey", date: "2026-09-15" }],
  services: "Job shadowing twice a semester.",
  courseOfStudy: "Business basics and math.",
});

describe("age", () => {
  it("counts whole years and turns on the birthday", () => {
    expect(ageOn("2012-10-22", "2026-10-21")).toBe(13);
    expect(ageOn("2012-10-22", "2026-10-22")).toBe(14);
    expect(ageOn("2012-02-29", "2026-02-28")).toBe(13);
    expect(ageOn("2012-02-29", "2026-03-01")).toBe(14);
  });
  it("says null for unreadable or future dates", () => {
    expect(ageOn("", "2026-10-22")).toBeNull();
    expect(ageOn("2012-02-31", "2026-10-22")).toBeNull();
    expect(ageOn("2030-01-01", "2026-10-22")).toBeNull();
  });
  it("applies from 14 and never on a bad date", () => {
    expect(needsTransition("2012-10-22", "2026-10-21")).toBe(false);
    expect(needsTransition("2012-10-22", "2026-10-22")).toBe(true);
    expect(needsTransition("2000-01-01", "2026-10-22")).toBe(true);
    expect(needsTransition("garbage", "2026-10-22")).toBe(false);
  });
});

describe("missing pieces", () => {
  it("lists everything for an empty plan, in screen order", () => {
    expect(missingPieces(emptyPlan())).toEqual([
      "A goal for education or training after high school.",
      "A goal for employment.",
      "At least one transition assessment.",
      "Transition services and activities.",
      "A course of study.",
    ]);
  });
  it("is complete with the required pieces, independent living optional", () => {
    expect(missingPieces(full())).toEqual([]);
    expect(isComplete(full())).toBe(true);
  });
  it("does not count blank text or a nameless assessment", () => {
    const p = full();
    p.goals.employment = "   ";
    p.assessments = [{ id: "a1", name: " ", date: "" }];
    p.courseOfStudy = "\n";
    expect(missingPieces(p)).toEqual([
      "A goal for employment.",
      "At least one transition assessment.",
      "A course of study.",
    ]);
  });
});

describe("storage", () => {
  it("returns an empty plan for a student with none", () => {
    expect(getTransition("s1")).toEqual(emptyPlan());
  });
  it("saves, reloads from storage, and clears", () => {
    setTransition("s1", full());
    expect(getTransition("s1")).toEqual(full());
    useTransitionStorage(mem);
    expect(getTransition("s1")).toEqual(full());
    clearTransition("s1");
    expect(getTransition("s1")).toEqual(emptyPlan());
  });
  it("trims long text and extra assessments", () => {
    const p = full();
    p.services = "x".repeat(MAX_TEXT + 50);
    p.assessments = Array.from({ length: MAX_ASSESSMENTS + 5 }, (_, i) => ({
      id: `a${i}`,
      name: "Survey",
      date: "",
    }));
    setTransition("s1", p);
    expect(getTransition("s1").services).toHaveLength(MAX_TEXT);
    expect(getTransition("s1").assessments).toHaveLength(MAX_ASSESSMENTS);
  });
  it("drops bad dates and ids-less assessments when reading stored data", () => {
    mem.setItem(
      TRANSITION_KEY,
      JSON.stringify({
        s1: {
          goals: { employment: "Work.", bogus: "ignored" },
          assessments: [
            { id: "a1", name: "Survey", date: "2026-13-40" },
            { name: "No id" },
            "junk",
          ],
          services: 5,
        },
        s2: "junk",
      }),
    );
    useTransitionStorage(mem);
    expect(getTransition("s1")).toEqual({
      goals: { employment: "Work." },
      assessments: [{ id: "a1", name: "Survey", date: "" }],
      services: "",
      courseOfStudy: "",
    });
    expect(getTransition("s2")).toEqual(emptyPlan());
  });
  it("starts empty when stored data cannot be parsed", () => {
    mem.setItem(TRANSITION_KEY, "{not json");
    useTransitionStorage(mem);
    expect(getTransition("s1")).toEqual(emptyPlan());
  });
  it("keeps one student's plan apart from another's", () => {
    setTransition("s1", full());
    expect(getTransition("s2")).toEqual(emptyPlan());
    resetTransitionForTests();
    expect(getTransition("s1")).toEqual(emptyPlan());
  });
});
