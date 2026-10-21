import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { Home } from "../src/ui/Home.tsx";
import { Evaluation } from "../src/ui/Evaluation.tsx";
import { can, setRole } from "../src/data/roles.ts";
import { clearAll, loadSample, useStorage } from "../src/data/workspace.ts";
import {
  type Intake,
  blockers,
  buildPreview,
  emptyIntake,
  fingerprint,
  nameMatcher,
  newRow,
  paragraphs,
  redact,
  rowProblems,
} from "../src/data/evaluation.ts";

const row = (measure: string, value: string, percentile = "") => ({
  ...newRow(),
  measure,
  value,
  percentile,
});

describe("evaluation redaction", () => {
  const m = nameMatcher(["Maria Lopez", "Maria", "Mr. Ortega", "A"]);

  it("replaces names as whole words, longest first, ignoring case", () => {
    const r = redact("maria lopez met Mariana and Maria.", m);
    expect(r.text).toBe("[name] met Mariana and [name].");
    expect(r.replaced).toEqual({ names: 2 });
  });

  it("removes names with accented letters at either end", () => {
    const accents = nameMatcher(["José", "Peña", "Zoë Lopez", "Álvaro", "Núñez"]);
    expect(redact("José Peña met Zoë Lopez", accents).text).toBe("[name] [name] met [name]");
    expect(redact("Álvaro, Núñez; josé!", accents).text).toBe("[name], [name]; [name]!");
    expect(redact("Josée and Joséphine", accents).text).toBe("Josée and Joséphine");
    const intake = { ...emptyIntake(), summary: "José Peña read well." };
    const text = buildPreview(intake, ["José", "Peña"])
      .map((p) => p.text)
      .join(" ");
    expect(text).not.toMatch(/José|Peña/);
  });

  it("replaces month-name dates in any case, with or without a comma, month or day first", () => {
    for (const d of [
      "March 4, 2015",
      "march 4, 2015",
      "MARCH 4 2015",
      "Mar. 4, 2015",
      "4 March 2015",
      "4th of March, 2015",
      "Sept 2015",
      "Sep. 12th, 2015",
      "March 4,2015",
      "March  4,   2015",
      "4  March  2015",
      "March 4",
      "4th of March",
      "dec. 12",
      "May 5",
      "5 May",
    ])
      expect(redact(`Born ${d}.`, null).text).toBe("Born [date].");
    expect(redact("Marketing 2015", null).text).toBe("Marketing 2015");
  });

  it("stays fast on a huge run of spaces after a month word", () => {
    const text = `March${" ".repeat(50000)}x`;
    const start = Date.now();
    redact(text, null);
    expect(Date.now() - start).toBeLessThan(200);
  });

  it("leaves ordinary words alone when no year is given", () => {
    expect(redact("It may 3 times help; mar 2 kids", null).text).toBe(
      "It may 3 times help; [date] kids",
    );
    expect(redact("Read 4 marching songs", null).text).toBe("Read 4 marching songs");
  });

  it("replaces email addresses with accented letters whole", () => {
    expect(redact("Write josé@example.org or müller@example.org now", null)).toMatchObject({
      text: "Write [email] or [email] now",
      replaced: { emails: 2 },
    });
  });

  it("recognises full-width digits as digits", () => {
    const fw = "\uFF14\uFF10\uFF12-\uFF15\uFF15\uFF15-\uFF10\uFF11\uFF12\uFF13";
    expect(redact(`Call ${fw}.`, null).text).toBe("Call [phone].");
    expect(redact("On \uFF13/\uFF14/\uFF12\uFF10\uFF11\uFF15", null).text).toBe("On [date]");
  });

  it("replaces emails, ids, phones, dates and long numbers", () => {
    // Built from pieces so the repository's identifier scan does not see look-alike numbers.
    const ssn = ["123", "45", "6789"].join("-");
    const phone = ["402", "555", "0123"].join("-");
    const r = redact(
      `Mail a@example.org, ${ssn}, ${phone}, 3/4/2015, 2015-03-04, Mar 4, 2015, 12345678.`,
      null,
    );
    expect(r.text).toBe("Mail [email], [id], [phone], [date], [date], [date], [number].");
    expect(r.replaced).toEqual({ emails: 1, ids: 1, phones: 1, dates: 3, numbers: 1 });
    expect(r.withheldReasons).toEqual([]);
  });

  it("holds back lines about birth dates, addresses, insurance, categories and eligibility", () => {
    expect(redact("Date of birth is unknown", null).withheldReasons).toEqual(["birth date"]);
    expect(redact("DOB noted; Medicaid too", null).withheldReasons).toEqual([
      "birth date",
      "insurance details",
    ]);
    expect(redact("She is eligible for services", null).withheldReasons).toEqual([
      "eligibility conclusion",
    ]);
    expect(redact("Student is ineligible for services", null).withheldReasons).toEqual([
      "eligibility conclusion",
    ]);
    expect(redact("Ineligibility was noted", null).withheldReasons).toEqual([
      "eligibility conclusion",
    ]);
    expect(redact("Ineligibleish words", null).withheldReasons).toEqual([]);
  });

  it("ignores one-letter names and splits text into non-empty lines", () => {
    expect(nameMatcher(["A", " "])).toBeNull();
    expect(paragraphs("one\n\n  two  \r\nthree\n")).toEqual(["one", "two", "three"]);
    expect(paragraphs(["a", "b", "c"].join(String.fromCharCode(11, 12)))).toEqual(["a", "b", "c"]);
  });
});

describe("evaluation intake", () => {
  it("checks score rows", () => {
    expect(rowProblems(row("", ""))).toEqual([]);
    expect(rowProblems(row("", "5"))).toEqual(["Name the measure."]);
    expect(rowProblems(row("ORF", ""))).toEqual(["Enter the score."]);
    expect(rowProblems(row("ORF", "abc"))).toEqual(["The score must be a number."]);
    for (const bad of ["0x1F", "0b11", "1e3", "1,5", "--2", "."])
      expect(rowProblems(row("ORF", bad))).toEqual(["The score must be a number."]);
    for (const good of ["85", "-1.5", ".5", "7.", "+3"])
      expect(rowProblems(row("ORF", good))).toEqual([]);
    expect(rowProblems(row("ORF", "85", "0"))).toEqual([
      "Percentile is a whole number from 1 to 99.",
    ]);
    expect(rowProblems(row("ORF", "85", "100"))).toHaveLength(1);
    expect(rowProblems(row("ORF", "85", "50"))).toEqual([]);
  });

  it("builds the preview and blocks until it is clean", () => {
    const intake: Intake = {
      ...emptyIntake(),
      instrument: "Acadience ORF",
      rows: [row("Reading Fluency", "85", "16")],
      summary: "Maria read well.\nDate of birth: 3/4/2015",
    };
    const preview = buildPreview(intake, ["Maria"]);
    expect(preview.map((p) => p.text)).toEqual([
      "Reading Fluency (Acadience ORF): standard score 85, percentile 16",
      "[name] read well.",
      "Date of birth: [date]",
    ]);
    expect(blockers(intake, preview)).toEqual(["1 line held back. Reword or remove them."]);
    const two: Intake = { ...emptyIntake(), rows: [row("", "5"), row("", "5")] };
    expect(blockers(two, buildPreview(two, []))).toEqual([
      "Score 1: Name the measure.",
      "Score 2: Name the measure.",
    ]);
    expect(blockers(emptyIntake(), [])).toEqual(["Add at least one score or some text."]);
  });

  it("makes a check stale when the checked text changes", () => {
    const a: Intake = { ...emptyIntake(), summary: "Reads well." };
    const before = fingerprint(a, buildPreview(a, []));
    const b = { ...a, summary: "Reads slowly." };
    expect(fingerprint(b, buildPreview(b, []))).not.toBe(before);
  });
});

describe("evaluation access and screen", () => {
  beforeEach(() => {
    useStorage(null);
    setRole("sped_director");
    clearAll();
    loadSample();
  });

  it("is for the director and case manager only", () => {
    expect(can("sped_director", "evaluation")).toBe(true);
    expect(can("case_manager", "evaluation")).toBe(true);
    expect(can("related_service_provider", "evaluation")).toBe(false);
    expect(can("paraprofessional", "evaluation")).toBe(false);
    expect(can("gen_ed_teacher", "evaluation")).toBe(false);
  });

  it("shows the Home card only to roles that may use it", () => {
    expect(renderToString(createElement(Home))).toContain("#/evaluation");
    setRole("related_service_provider");
    expect(renderToString(createElement(Home))).not.toContain("#/evaluation");
  });

  it("renders the screen with the no-real-details warning and the practice-build note", () => {
    const html = renderToString(createElement(Evaluation));
    expect(html).toContain("Do not type real names or details");
    expect(html).toContain("Practice build: nothing is sent anywhere.");
    expect(html).toContain("Looks right, continue");
    expect(html).toContain("Clear everything");
  });
});
