import { describe, expect, it } from "vitest";
import {
  type PwnInput,
  copyText,
  dateText,
  draftPwn,
  pwnFingerprint,
  vagueAmount,
} from "../src/data/pwn.ts";

function base(): PwnInput {
  return {
    noteDate: "2027-01-05",
    deliveryDate: "2027-01-07",
    deliveryMethod: "Hand delivered",
    rows: [
      {
        kind: "special_education",
        title: "Reading instruction",
        change: "added",
        frequency: "22 days/semester",
        duration: "30 min/day",
        location: "Resource room",
        start: "2027-01-10",
        end: "2027-12-15",
      },
      {
        kind: "related",
        title: "Speech therapy",
        change: "changed",
        frequency: "2 sessions/week",
        duration: "20 min/session",
        location: "Speech room",
      },
      {
        kind: "accommodation",
        title: "Extra time",
        change: "unchanged",
        frequency: "",
        duration: "",
        location: "",
      },
    ],
    goals: [
      { area: "Reading fluency", change: "added" },
      { area: "Math facts", change: "unchanged" },
    ],
    considerations: [
      {
        label: "Assistive technology",
        choice: "considered_not_needed",
        reason: "Current tools meet the student's needs.",
      },
      { label: "Communication needs", choice: "needed" },
    ],
    esy: { choice: "considered_not_needed", reason: "Skills held steady over the last break." },
    alternatives: [
      { option: "General education only", reason: "the data show a need for small-group practice" },
    ],
    evaluations: ["Oral reading probe", "Math facts probe"],
    otherFactors: ["Family prefers morning services."],
    reasons: ["Progress data show the student needs daily small-group reading practice."],
    contact: { name: "Pat Example", role: "Case manager", phone: "555-0100" },
  };
}

describe("dateText", () => {
  it("formats real days and rejects fake ones", () => {
    expect(dateText("2027-01-05")).toBe("Jan 5, 2027");
    expect(dateText("2027-02-30")).toBe("");
    expect(dateText("01/05/2027")).toBe("");
    expect(dateText(undefined)).toBe("");
    expect(dateText(" 2027-01-05 ")).toBe("Jan 5, 2027");
  });
});

describe("vagueAmount", () => {
  it("flags empty and as-needed text only", () => {
    expect(vagueAmount("")).toBe(true);
    expect(vagueAmount(" As needed. ")).toBe(true);
    expect(vagueAmount("22 days/semester")).toBe(false);
    expect(vagueAmount("as needed during testing weeks, 2 per week")).toBe(false);
  });
});

describe("draftPwn", () => {
  it("builds every box from the entries with nothing blocked", () => {
    const d = draftPwn(base());
    expect(d.blocked).toEqual([]);
    expect(d.noteDate).toBe("Jan 5, 2027");
    const get = (id: string) => d.boxes.find((b) => b.id === id)!.text;
    expect(get("proposed")).toContain(
      "- Start Reading instruction (special education): 22 days/semester, 30 min/day, in Resource room from Jan 10, 2027 to Dec 15, 2027",
    );
    expect(get("proposed")).toContain(
      "- Change to Speech therapy (related service): 2 sessions/week",
    );
    expect(get("proposed")).toContain("- Add the annual goal: Reading fluency");
    expect(get("proposed")).not.toContain("Extra time");
    expect(get("proposed")).not.toContain("Math facts");
    expect(get("refused")).toContain("No assistive technology supports at this time");
    expect(get("refused")).toContain("No extended school year services at this time");
    expect(get("refused")).not.toContain("Communication");
    expect(get("why")).toContain("Assistive technology: Current tools meet the student's needs.");
    expect(get("other_options")).toContain("General education only: rejected because");
    expect(get("evaluation")).toBe("The team used: Oral reading probe; Math facts probe.");
    expect(get("contact")).toBe("Pat Example, Case manager, 555-0100");
  });

  it("is deterministic", () => {
    expect(pwnFingerprint(draftPwn(base()))).toBe(pwnFingerprint(draftPwn(base())));
  });

  it("blocks vague frequency, missing location and missing reasons", () => {
    const i = base();
    i.rows[0]!.frequency = "as needed";
    i.rows[1]!.location = " ";
    i.considerations[0]!.reason = "";
    delete i.esy.reason;
    const d = draftPwn(i);
    expect(d.blocked).toContain("Reading instruction: frequency needs a count or a condition.");
    expect(d.blocked).toContain("Speech therapy: location is missing.");
    expect(d.blocked).toContain("Assistive technology: add the one-line reason it is not needed.");
    expect(d.blocked).toContain(
      "Extended school year: add the data-based reason it is not needed.",
    );
  });

  it("does not check rows that are unchanged or removed", () => {
    const i = base();
    i.rows[2]!.change = "removed";
    const d = draftPwn(i);
    expect(d.blocked).toEqual([]);
    expect(d.boxes.find((b) => b.id === "refused")!.text).toContain(
      "Stop Extra time (accommodation)",
    );
  });

  it("blocks when nothing changed, evidence or contact is missing, or dates are wrong", () => {
    const i = base();
    i.rows = [];
    i.goals = [];
    i.evaluations = [" "];
    i.contact.name = "";
    i.noteDate = "2027-13-01";
    i.deliveryDate = "2027-01-04";
    const d = draftPwn(i);
    expect(d.blocked).toEqual(
      expect.arrayContaining([
        "Date of note is not a real date.",
        "Nothing was added or changed, so there is no action to propose.",
        "Confirm at least one evaluation instrument.",
        "Add the case manager's name and role as the contact.",
      ]),
    );
  });

  it("blocks a delivery date before the note date", () => {
    const i = base();
    i.deliveryDate = "2027-01-04";
    expect(draftPwn(i).blocked).toContain("Date of delivery is before the date of note.");
  });

  it("blocks an incomplete alternative once", () => {
    const i = base();
    i.alternatives = [
      { option: "", reason: "x" },
      { option: "y", reason: "" },
    ];
    const d = draftPwn(i);
    expect(d.blocked.filter((b) => b.startsWith("Other options"))).toHaveLength(1);
  });
});

describe("draftPwn sibling checks", () => {
  it("blocks impossible and reversed service dates", () => {
    const i = base();
    i.rows[0]!.start = "2027-02-30";
    i.rows[1]!.start = "2027-03-01";
    i.rows[1]!.end = "2027-02-01";
    const d = draftPwn(i);
    expect(d.blocked).toContain("Reading instruction: start date is not a real date.");
    expect(d.blocked).toContain("Speech therapy: end date is before the start date.");
  });

  it("blocks a missing role and ignores blank other factors", () => {
    const i = base();
    i.contact.role = " ";
    i.otherFactors = ["  ", ""];
    const d = draftPwn(i);
    expect(d.boxes.find((b) => b.id === "contact")!.text).toBe("Pat Example, 555-0100");
    expect(d.blocked).toContain("Add the case manager's name and role as the contact.");
    expect(d.boxes.find((b) => b.id === "other_factors")!.text).toBe("None.");
  });

  it("blocks blank titles and goal labels", () => {
    const i = base();
    i.rows[0]!.title = " ";
    i.goals[0]!.area = "";
    const d = draftPwn(i);
    expect(d.blocked).toContain("A service row needs a title.");
    expect(d.blocked).toContain("A goal needs a short area label.");
  });
});

describe("padded dates", () => {
  it("keeps a padded service date in the notice", () => {
    const i = base();
    i.rows[0]!.start = " 2027-01-10";
    const d = draftPwn(i);
    expect(d.blocked).toEqual([]);
    expect(d.boxes.find((b) => b.id === "proposed")!.text).toContain("from Jan 10, 2027");
  });
});

describe("padded note dates", () => {
  it("compares delivery to note date after trimming", () => {
    const i = base();
    i.noteDate = " 2027-01-05";
    i.deliveryDate = " 2027-01-07 ";
    expect(draftPwn(i).blocked).toEqual([]);
  });
});

describe("removed goals", () => {
  it("lists a removed goal as refused and does not call it an empty change", () => {
    const i = base();
    i.rows = [];
    i.goals = [{ area: "Math facts", change: "removed" }];
    const d = draftPwn(i);
    expect(d.blocked).toEqual([]);
    expect(d.boxes.find((b) => b.id === "refused")!.text).toContain(
      "- Stop the annual goal: Math facts",
    );
    expect(d.boxes.find((b) => b.id === "proposed")!.text).toBe("No new action is proposed.");
  });

  it("blocks a removed goal without a label", () => {
    const i = base();
    i.goals = [{ area: " ", change: "removed" }];
    expect(draftPwn(i).blocked).toContain("A goal needs a short area label.");
  });
});

describe("reasons", () => {
  it("lists the teacher's reasons and never invents one", () => {
    const d = draftPwn(base());
    expect(d.boxes.find((b) => b.id === "why")!.text).toContain(
      "daily small-group reading practice",
    );
  });

  it("blocks the why box when an action has no reason", () => {
    const i = base();
    i.reasons = [" "];
    const d = draftPwn(i);
    expect(d.blocked).toContain("Add the team's reason for the action in your own words.");
    expect(d.boxes.find((b) => b.id === "why")!.text).not.toContain("The team made");
  });
});

describe("why box with nothing to say", () => {
  it("is blocked, not an empty ready box, when there are no actions and no reasons", () => {
    const i = base();
    i.rows = [];
    i.goals = [];
    i.considerations = [];
    i.esy = { choice: "needed" };
    delete i.reasons;
    const d = draftPwn(i);
    expect(d.blocked).toContain("Add the team's reason for the action in your own words.");
    expect(copyText(d, "why")).toBeNull();
  });
});

describe("copyText", () => {
  it("returns text for a ready box and null for a blocked one", () => {
    const d = draftPwn(base());
    expect(copyText(d, "contact")).toBe("Pat Example, Case manager, 555-0100");
    const i = base();
    i.contact.name = "";
    expect(copyText(draftPwn(i), "contact")).toBeNull();
  });
});
