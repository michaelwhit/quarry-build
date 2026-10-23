import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { setRole } from "../src/data/roles.ts";
import { students } from "../src/data/district.ts";
import { RECENT_NOTE_LIMIT, recentNotes } from "../src/data/recentNotes.ts";
import { addPoint, loadSample, useStorage } from "../src/data/workspace.ts";
import { RecentNotes } from "../src/ui/RecentNotes.tsx";

beforeEach(() => {
  useStorage(null);
  setRole("sped_director");
  loadSample();
});

const first = () => students[0]!;

describe("recent notes", () => {
  it("lists at most five notes, newest first, each with a goal label", () => {
    const goal = first().goals[0]!.goal.id;
    for (let i = 0; i < 7; i++) addPoint(goal, 3, `Practice note ${i}`);
    const notes = recentNotes(first().student.id);
    expect(notes).toHaveLength(RECENT_NOTE_LIMIT);
    const times = notes.map((n) => n.at);
    expect(times).toEqual([...times].sort().reverse());
    expect(notes.every((n) => /^Goal \d+$/.test(n.goalLabel))).toBe(true);
  });

  it("skips data points without a note and removes the last name", () => {
    const s = first();
    const goal = s.goals[0]!.goal.id;
    addPoint(goal, 3, "");
    addPoint(goal, 3, `${s.student.last_name} stayed on task.`);
    const notes = recentNotes(s.student.id);
    expect(notes.every((n) => n.text !== "")).toBe(true);
    expect(notes.some((n) => n.text.includes(s.student.last_name))).toBe(false);
    expect(notes.some((n) => n.text.includes("stayed on task."))).toBe(true);
  });

  it("returns nothing for an unknown student and shows an empty note", () => {
    expect(recentNotes("nobody")).toEqual([]);
    expect(renderToString(createElement(RecentNotes, { studentId: "nobody" }))).toContain(
      "No session notes yet.",
    );
  });

  it("renders the list for a student", () => {
    const s = first();
    addPoint(s.goals[0]!.goal.id, 3, "Used the picture cards.");
    const html = renderToString(createElement(RecentNotes, { studentId: s.student.id }));
    expect(html).toContain("Recent notes");
    expect(html).toContain("Used the picture cards.");
  });
});
