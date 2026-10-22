import { scrub, studentById } from "../district.ts";
import { SLOTS, getPl, getPlVersion, subscribePl } from "../presentLevels.ts";
import type { Builder, PacketItem } from "../srsPacket.ts";

export const section = "plaafp";
export const subscribe = subscribePl;
export const version = getPlVersion;

export function slotItem(key: string, label: string, studentId: string): PacketItem {
  const slot = getPl(studentId).slots[key];
  const s = studentById(studentId)?.student;
  if (!slot || slot.text.trim() === "") return { id: key, label, blocked: "Nothing written yet." };
  if (!slot.approved) return { id: key, label, blocked: "Approve this in Present levels first." };
  return { id: key, label, text: s ? scrub(slot.text, s) : slot.text };
}

/** SRS has one box for present levels: copy the approved areas together, or one area at a time. */
export const items: Builder = (studentId) => {
  const defs = SLOTS.filter((d) => d.key.startsWith("plaafp."));
  const rec = getPl(studentId);
  const written = defs.filter((d) => (rec.slots[d.key]?.text.trim() ?? "") !== "");
  const items = written.map((d) => ({ ...slotItem(d.key, d.label, studentId), optional: true }));
  const whole: PacketItem = { id: "plaafp.whole", label: "Present level, whole box" };
  if (written.length === 0) return [{ ...whole, blocked: "Nothing written yet." }];
  const waiting = items.find((i) => i.blocked)?.blocked;
  if (waiting !== undefined) return [{ ...whole, blocked: waiting }, ...items];
  return [{ ...whole, text: items.map((i) => `${i.label}\n${i.text}`).join("\n\n") }, ...items];
};
