import { scrub, studentById } from "../district.ts";
import {
  getIepShort,
  getIepShortVersion,
  subscribeIepShort,
  PARENT_QUESTIONS,
  usDate,
} from "../iepShort.ts";
import type { Builder, PacketItem } from "../srsPacket.ts";

export const section = "attendance";
export const subscribe = subscribeIepShort;
export const version = getIepShortVersion;

export const items: Builder = (studentId) => {
  const r = getIepShort(studentId);
  const view = studentById(studentId);
  const rows = r.attendees.map((a, i): PacketItem => {
    const id = `attend.${a.id}`;
    const label = `Attendee ${i + 1}`;
    const name = view ? scrub(a.name, view.student).trim() : a.name.trim();
    if (!name) return { id, label, blocked: "Enter the person's name." };
    if (!a.position) return { id, label, blocked: "Choose a position." };
    if (!a.date) return { id, label, blocked: "Enter the date." };
    return {
      id,
      label,
      text: `${name}, ${a.position}, ${usDate(a.date)}`,
      pick: `position ${a.position}; attended ${a.attended ? "Yes" : "No"}`,
    };
  });
  if (rows.length === 0)
    rows.push({ id: "attend.none", label: "Attendees", blocked: "Add the people at the meeting." });
  const parent = PARENT_QUESTIONS.map((q, i): PacketItem => {
    const id = `attend.parent${i + 1}`;
    const a = r.parent[i];
    return a
      ? { id, label: q, pick: `${q}: ${a === "yes" ? "Yes" : "No"}` }
      : { id, label: q, blocked: "Answer yes or no." };
  });
  return [...rows, ...parent];
};
