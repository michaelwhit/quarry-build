import type { Workspace } from "./workspace.ts";

// Who else can see one student, read from the two switches the student page already has: served by
// an SLP or school psychologist, and goals shared for data entry. Practice data only. This lists
// access; it changes nothing.

export interface AccessLine {
  who: string;
  why: string;
}

const words = (t: string) => t.replaceAll("_", " ");

export function accessLines(ws: Workspace, studentId: string): AccessLine[] {
  const lines: AccessLine[] = [];
  if (ws.served.includes(studentId))
    lines.push({
      who: "SLP or school psychologist",
      why: "Serves this student and sees what the service needs",
    });
  const iep = ws.ieps.find((i) => i.student_id === studentId);
  const goals = ws.goals.filter((g) => g.iep_id === iep?.id);
  const shared = goals.filter((g) => ws.delegated.includes(g.id));
  if (shared.length > 0)
    lines.push({
      who: "Paras and general-education teachers",
      why: `Data entry on ${shared.length} of ${goals.length} ${goals.length === 1 ? "goal" : "goals"}: ${shared
        .map((g) => words(g.area))
        .join(", ")}`,
    });
  return lines;
}
