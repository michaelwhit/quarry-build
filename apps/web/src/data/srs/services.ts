import { scrub, studentById } from "../district.ts";
import {
  DATE,
  getServices,
  getServicesVersion,
  kindLabel,
  rowProblem,
  subscribeServices,
} from "../serviceRows.ts";
import type { Builder, PacketItem } from "../srsPacket.ts";

export const section = "services";
export const subscribe = subscribeServices;
export const version = getServicesVersion;

const fmtDate = (d: string) =>
  DATE.test(d) ? `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}` : d;

/** Copy items for the Services section, in the order of the SRS table cells. */
export const items: Builder = (studentId) => {
  const s = studentById(studentId)?.student;
  const clean = (t: string) => (s ? scrub(t, s) : t).trim();
  const seen = new Map<string, number>();
  return getServices(studentId).rows.flatMap((r): PacketItem[] => {
    const count = (seen.get(r.kind) ?? 0) + 1;
    seen.set(r.kind, count);
    const n = `${kindLabel(r.kind)} ${count}`;
    const problem = rowProblem(r);
    if (problem !== undefined)
      return [
        { id: `${r.id}.blocked`, label: `${n}: ${r.title.trim() || "unnamed"}`, blocked: problem },
      ];
    return [
      { id: `${r.id}.service`, label: `${n}: service`, text: clean(r.title) },
      {
        id: `${r.id}.dates`,
        label: `${n}: start and end dates`,
        text: r.end ? `${fmtDate(r.start)} to ${fmtDate(r.end)}` : fmtDate(r.start),
      },
      { id: `${r.id}.frequency`, label: `${n}: Frequency`, text: clean(r.frequency) },
      { id: `${r.id}.duration`, label: `${n}: Duration`, text: clean(r.duration) },
      { id: `${r.id}.location`, label: `${n}: Location`, text: clean(r.location) },
      {
        id: `${r.id}.calendar`,
        label: `${n}: follows school calendar`,
        pick: r.followsCalendar ? "Yes" : "No",
      },
    ];
  });
};
