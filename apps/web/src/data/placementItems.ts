import type { PacketItem } from "./srsPacket.ts";
import { scrub, studentById } from "./district.ts";

/** One text box as a copy item: scrubbed, or blocked while empty. */
export function boxItem(id: string, label: string, raw: string, studentId: string): PacketItem {
  const s = studentById(studentId)?.student;
  const t = (s ? scrub(raw, s) : raw).trim();
  return t ? { id, label, text: t } : { id, label, blocked: "Nothing written yet." };
}
