import {
  BOXES,
  considerationText,
  getConsiderations,
  getConsiderationsVersion,
  subscribeConsiderations,
} from "../considerations.ts";
import { SLOTS, getPlVersion, subscribePl } from "../presentLevels.ts";
import type { Builder } from "../srsPacket.ts";
import { slotItem } from "./plaafp.ts";

export const section = "considerations";
export const subscribe = (l: () => void) => {
  const a = subscribeConsiderations(l);
  const b = subscribePl(l);
  return () => {
    a();
    b();
  };
};
export const version = () => getConsiderationsVersion() + getPlVersion();

/** Strengths, parent input, evaluation and assessment results, then the consideration boxes. */
export const items: Builder = (studentId) => {
  const mine = getConsiderations(studentId);
  return [
    ...SLOTS.filter((d) => d.key.startsWith("summary.")).map((d) =>
      slotItem(d.key, d.label, studentId),
    ),
    ...BOXES.map((b) => {
      const r = considerationText(mine[b.id]);
      return { id: `consider.${b.id}`, label: b.label, ...r };
    }),
  ];
};
