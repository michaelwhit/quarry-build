import { describe, expect, it } from "vitest";
import {
  type Contact,
  STANDARD,
  addSchoolDays,
  draftConsent,
  draftInvite,
  draftTimeline,
  noticeCopy,
  timelineText,
} from "../src/data/meetingNotices.ts";

const contact: Contact = { name: "Pat Example", role: "Case manager", phone: "555-0100" };

describe("draftInvite", () => {
  const base = () => ({
    purpose: "annual_review" as const,
    meetingDate: "2027-02-03",
    meetingTime: "9:30 AM",
    location: "Room 12",
    invitees: [
      { name: "Sam Sample", position: "Parent" },
      { name: "Alex Example", position: "Regular education teacher" },
    ],
    contact,
  });

  it("builds every box from the entries", () => {
    const d = draftInvite(base());
    expect(d.blocked).toEqual([]);
    const get = (id: string) => noticeCopy(d, id);
    expect(get("purpose")).toBe(
      "We are inviting you to a meeting to review the individualized education program and plan for the coming year.",
    );
    expect(get("when_where")).toBe("Feb 3, 2027, 9:30 AM, Room 12");
    expect(get("invitees")).toBe("- Sam Sample, Parent\n- Alex Example, Regular education teacher");
    expect(get("reschedule")).toBe(STANDARD.reschedule);
    expect(get("contact")).toBe("Pat Example, Case manager, 555-0100");
  });

  it("blocks a fake date, missing time and place, and half-filled invitees", () => {
    const i = base();
    i.meetingDate = "2027-02-30";
    i.meetingTime = " ";
    i.location = "";
    i.invitees = [{ name: "Sam Sample", position: "" }];
    const d = draftInvite(i);
    expect(d.blocked).toEqual(
      expect.arrayContaining([
        "Date of the meeting is not a real date.",
        "Add the meeting time.",
        "Add the meeting place.",
        "Add at least one person invited.",
        "Each person invited needs a name and a position.",
      ]),
    );
    expect(noticeCopy(d, "when_where")).toBeNull();
  });

  it("ignores fully blank invitee rows", () => {
    const i = base();
    i.invitees.push({ name: " ", position: "" });
    const d = draftInvite(i);
    expect(d.blocked).toEqual([]);
    expect(noticeCopy(d, "invitees")).not.toContain("\n- ,");
  });

  it("blocks a contact without a role", () => {
    const i = base();
    i.contact = { name: "Pat Example", role: " " };
    expect(draftInvite(i).blocked).toContain("Add the contact's name and role.");
  });
});

describe("draftConsent", () => {
  const base = () => ({
    activity: "reevaluation" as const,
    areas: ["Reading", " "],
    instruments: ["Oral reading probe"],
    reason: "The three-year review is due.",
    contact,
  });

  it("builds the boxes and drops blank areas", () => {
    const d = draftConsent(base());
    expect(d.blocked).toEqual([]);
    expect(noticeCopy(d, "areas")).toBe(
      "Areas: Reading.\nProcedures and instruments: Oral reading probe.",
    );
    expect(noticeCopy(d, "request")).toContain("a reevaluation of the student's needs");
    expect(noticeCopy(d, "voluntary")).toBe(STANDARD.voluntary);
  });

  it("blocks a missing reason, and missing areas only for an evaluation", () => {
    const i = base();
    i.reason = " ";
    i.areas = [];
    expect(draftConsent(i).blocked).toEqual(
      expect.arrayContaining([
        "Add the reason in your own words.",
        "Name at least one area to be evaluated.",
      ]),
    );
    const j = { ...base(), activity: "initial_services" as const, areas: [], instruments: [] };
    expect(draftConsent(j).blocked).toEqual([]);
  });
});

describe("addSchoolDays", () => {
  it("skips weekends and listed no-school days", () => {
    // Fri Jan 8 2027 + 1 school day is Mon Jan 11.
    expect(addSchoolDays("2027-01-08", 1, [])).toBe("2027-01-11");
    expect(addSchoolDays("2027-01-08", 1, ["2027-01-11"])).toBe("2027-01-12");
    expect(addSchoolDays("2027-01-08", 5, [])).toBe("2027-01-15");
  });
  it("returns nothing for a fake start date", () => {
    expect(addSchoolDays("2027-02-30", 3, [])).toBe("");
  });
});

describe("draftTimeline", () => {
  it("lists consent, due date and meeting date", () => {
    const d = draftTimeline({
      consentDate: "2027-01-08",
      schoolDaysAllowed: 5,
      noSchoolDays: ["2027-01-13"],
      meetingWithinDays: 2,
    });
    expect(d.blocked).toEqual([]);
    expect(timelineText(d)).toBe(
      [
        "Consent received: Jan 8, 2027",
        "Evaluation due (5 school days): Jan 18, 2027",
        "Meeting by (2 school days after the due date): Jan 20, 2027",
      ].join("\n"),
    );
  });

  it("blocks bad numbers and dates without guessing", () => {
    const d = draftTimeline({
      consentDate: "2027-13-01",
      schoolDaysAllowed: 0,
      noSchoolDays: ["nope"],
      meetingWithinDays: 2.5,
    });
    expect(d.rows).toEqual([]);
    expect(d.blocked).toHaveLength(4);
    expect(timelineText(d)).toBeNull();
  });
});
