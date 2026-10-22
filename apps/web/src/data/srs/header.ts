import { scrub, studentById } from "../district.ts";
import {
  getIepShort,
  getIepShortVersion,
  subscribeIepShort,
  reviewDate,
  usDate,
} from "../iepShort.ts";
import type { Builder, PacketItem } from "../srsPacket.ts";

export const section = "header";
export const subscribe = subscribeIepShort;
export const version = getIepShortVersion;

const need = (id: string, label: string, text: string, why: string): PacketItem =>
  text ? { id, label, text } : { id, label, blocked: why };

export const items: Builder = (studentId) => {
  const r = getIepShort(studentId);
  const view = studentById(studentId);
  const school = view ? scrub(r.school, view.student).trim() : r.school.trim();
  return [
    need(
      "header.effective",
      "IEP effective date",
      usDate(r.effective),
      "Enter the effective date.",
    ),
    need(
      "header.review",
      "Review within a year (date)",
      usDate(reviewDate(r.effective)),
      "Enter the effective date first.",
    ),
    need("header.meeting", "Meeting date", usDate(r.meeting), "Enter the meeting date."),
    need("header.school", "School", school, "Enter the school."),
    need("header.grade", "Grade", view?.student.grade.trim() ?? "", "No grade on the student."),
  ];
};
