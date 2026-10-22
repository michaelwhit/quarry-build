import { scrub, studentById } from "../district.ts";
import { SLOTS, getPl, getPlVersion, subscribePl } from "../presentLevels.ts";
import type { Builder } from "../srsPacket.ts";

export const section = "plaafp";
export const subscribe = subscribePl;
export const version = getPlVersion;

export const items: Builder = (studentId) => {
  const rec = getPl(studentId);
  const s = studentById(studentId)?.student;
  return SLOTS.map((def) => {
    const slot = rec.slots[def.key];
    if (!slot || slot.text.trim() === "")
      return { id: def.key, label: def.label, blocked: "Nothing written yet." };
    if (!slot.approved)
      return { id: def.key, label: def.label, blocked: "Approve this in Present levels first." };
    return { id: def.key, label: def.label, text: s ? scrub(slot.text, s) : slot.text };
  });
};
