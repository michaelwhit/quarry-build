import { describe, expect, it } from "vitest";
import { accommodations, goals } from "../src/data/library.ts";
import {
  checks,
  formSlots,
  initialValues,
  isReady,
  masteryLine,
  preview,
  renderedText,
  segments,
  vagueFrequency,
  slotNames,
} from "../src/data/libraryText.ts";

const TODAY = "2026-10-21";

describe("template wording", () => {
  it("splits text, blanks and suggested numbers", () => {
    expect(segments("Read {word_type} at {95} for {student}")).toEqual([
      { kind: "text", text: "Read " },
      { kind: "slot", name: "word_type" },
      { kind: "text", text: " at " },
      { kind: "number", text: "95" },
      { kind: "text", text: " for " },
      { kind: "slot", name: "student" },
    ]);
  });
  it("keeps an unclosed brace as text", () => {
    expect(segments("a { b")).toEqual([{ kind: "text", text: "a { b" }]);
  });
  it("shows blanks in brackets and finds blank names without the student", () => {
    expect(preview("{student} reads {word_type} by {date}")).toBe(
      "the student reads [word type] by [date]",
    );
    expect(slotNames("{student} {a} {b} {a}")).toEqual(["a", "b"]);
  });
});

describe("sample library", () => {
  it("is small, original and consistent", () => {
    expect(goals.length).toBeLessThanOrEqual(15);
    expect(accommodations.length).toBeLessThanOrEqual(15);
    expect(new Set(goals.map((g) => g.id)).size).toBe(goals.length);
    for (const g of goals) {
      // Every blank in the wording is declared or is the date.
      const declared = new Set(g.slots.map((s) => s.name));
      for (const n of slotNames(g.template_text))
        expect(declared.has(n) || n === "date").toBe(true);
    }
  });

  it("every goal becomes ready once its blanks are filled", () => {
    for (const g of goals) {
      const values = initialValues(g);
      for (const s of formSlots(g)) {
        if (values[s.name]) continue;
        values[s.name] =
          s.kind === "date" ? "2027-05-20" : s.kind === "number" ? "90" : (s.choices?.[0] ?? "x");
      }
      expect(isReady(g, values, TODAY), g.id).toBe(true);
      expect(renderedText(g, values, "Ava")).not.toMatch(/\[|\{/);
    }
  });
});

describe("checks", () => {
  const goal = goals.find((g) => g.id === "g-fluency")!;
  const failing = (values: Record<string, string>) =>
    checks(goal, values, TODAY)
      .filter((c) => !c.pass)
      .map((c) => c.id);

  it("asks for every blank and a date", () => {
    expect(failing({})).toEqual(["slots", "criterion", "date"]);
  });
  it("wants a plain number for the target", () => {
    expect(failing({ target_wcpm: "90 wpm", date: "2027-01-01" })).toEqual(["criterion"]);
    expect(failing({ target_wcpm: "0", date: "2027-01-01" })).toEqual(["criterion"]);
    expect(failing({ target_wcpm: "90", date: "2027-01-01" })).toEqual([]);
  });
  it("refuses a date in the past", () => {
    expect(failing({ target_wcpm: "90", date: "2026-01-01" })).toEqual(["date"]);
  });
  it("refuses unobservable verbs and vague frequency", () => {
    const vague = { ...goal, behavior_text: "understand the passage" };
    expect(
      checks(vague, { target_wcpm: "90", date: "2027-01-01" }, TODAY).find(
        (c) => c.id === "observable",
      )?.pass,
    ).toBe(false);
    const free = {
      ...goal,
      template_text: "{student} will practice {when} by {date}",
      slots: [
        { name: "when", kind: "text" as const },
        { name: "date", kind: "date" as const },
      ],
    };
    const bad = checks(free, { when: "as needed", date: "2027-01-01" }, TODAY);
    expect(bad.find((c) => c.id === "frequency")?.pass).toBe(false);
  });
  it("describes how a goal is met in plain words", () => {
    expect(masteryLine(goals[0]!.mastery)).toBe(
      "At or above 80%, 3 times in a row, then a later check that it lasts",
    );
    expect(masteryLine(goal.mastery)).toContain("the [target wcpm] you choose");
  });
});

describe("sample library links", () => {
  it("ladders and related accommodations are real", () => {
    const ids = new Set(accommodations.map((a) => a.id));
    for (const g of goals) {
      expect(g.objective_ladder.length, g.id).toBeGreaterThan(1);
      for (const r of g.related_accommodation_ids) expect(ids.has(r), `${g.id} ${r}`).toBe(true);
    }
    expect(goals.some((g) => g.requires_fba_bip)).toBe(true);
  });
  it("refuses vague frequencies on accommodations", () => {
    expect(vagueFrequency("As needed")).toBe(true);
    expect(vagueFrequency("Up to 3 times a day")).toBe(false);
  });
});

describe("typed targets", () => {
  it("masteryLine uses the typed number, and the placeholder only while it is empty", () => {
    const g =
      goals.find((x) => x.id === "g-wcpm") ?? goals.find((x) => x.target_value === "from_slot");
    expect(g).toBeDefined();
    const slot = g!.mastery.threshold_from_slot as string;
    expect(masteryLine(g!.mastery)).toContain(`[`);
    expect(masteryLine(g!.mastery, { [slot]: "90" })).toContain("90");
    expect(masteryLine(g!.mastery, { [slot]: "90" })).not.toContain("[");
    expect(masteryLine(g!.mastery, { [slot]: "  " })).toContain("[");
  });
  it("every goal that takes its target from a blank names a blank that exists and is checked", () => {
    for (const g of goals.filter((x) => x.target_value === "from_slot")) {
      const slot = g.target_slot ?? "";
      expect(
        g.slots.some((s) => s.name === slot && s.kind === "number"),
        g.id,
      ).toBe(true);
      expect(g.mastery.threshold_from_slot, g.id).toBe(slot);
    }
  });
  it("stay on task takes its minutes from the blank and refuses bad numbers", () => {
    const g = goals.find((x) => x.id === "g-onTask")!;
    expect(g.target_value).toBe("from_slot");
    expect(g.target_slot).toBe("minutes");
    const base = { ...initialValues(g), date: "2027-03-01" };
    const crit = (v: Record<string, string>) =>
      checks(g, v, TODAY).find((c) => c.id === "criterion")!;
    expect(crit({ ...base, minutes: "12" }).pass).toBe(true);
    expect(masteryLine(g.mastery, { minutes: "12" })).toContain("12 minutes");
    for (const bad of ["", "0", "-3", "ten", "10%"])
      expect(crit({ ...base, minutes: bad }).pass).toBe(false);
  });
});

describe("matching edge cases", () => {
  it("only a whole phrase counts as a vague frequency", () => {
    expect(vagueFrequency("Daily, as needed.")).toBe(true);
    expect(vagueFrequency("elif needed")).toBe(false);
    expect(vagueFrequency("Twice a day, as needed by the teacher")).toBe(true);
  });
  it("only plain numbers in braces are shown as is", () => {
    expect(segments("a {95} b")[1]).toEqual({ kind: "number", text: "95" });
    expect(segments("a { } b").some((x) => x.kind === "number")).toBe(false);
    expect(segments("a {1e3} b").some((x) => x.kind === "number")).toBe(false);
  });
  it("a date that is not yyyy-mm-dd does not pass", () => {
    const g = goals.find((x) => x.id === "g-onTask")!;
    const v = { ...initialValues(g), minutes: "5", date: "zzz" };
    expect(checks(g, v, TODAY).find((c) => c.id === "date")!.pass).toBe(false);
    expect(checks(g, { ...v, date: TODAY }, TODAY).find((c) => c.id === "date")!.pass).toBe(true);
  });
});
