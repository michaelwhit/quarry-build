import { scrub, studentById } from "../district.ts";
import { getIepShort, getIepShortVersion, subscribeIepShort } from "../iepShort.ts";
import type { Builder, PacketItem } from "../srsPacket.ts";

export const section = "alt_assessment";
export const subscribe = subscribeIepShort;
export const version = getIepShortVersion;

export const items: Builder = (studentId) => {
  const r = getIepShort(studentId);
  const view = studentById(studentId);
  const why = (view ? scrub(r.altWhy, view.student) : r.altWhy).trim();
  const req: PacketItem = r.altRequired
    ? {
        id: "alt.required",
        label: "Required to take the state assessment",
        pick: `Required to take the state assessment: ${r.altRequired === "yes" ? "Yes" : "No"}`,
      }
    : {
        id: "alt.required",
        label: "Required to take the state assessment",
        blocked: "Answer yes or no.",
      };
  const box: PacketItem = { id: "alt.why", label: "Alternate assessment explanation" };
  if (r.altRequired === "no")
    return [
      req,
      why
        ? { ...box, text: why }
        : { ...box, blocked: "Explain why the student is not required to take it." },
    ];
  return [req, ...(why ? [{ ...box, text: why, optional: true }] : [])];
};
