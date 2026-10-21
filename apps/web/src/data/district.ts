import type { Goal, MeasurementPlan, Student } from "@synthetic/src/types.ts";
import {
  type GoalProgress,
  type SeriesPoint,
  progressFor,
  seriesFor,
  worstStatus,
} from "./derive.ts";
import { type RoleId, getRole, isDelegateRole, subscribeRole } from "./roles.ts";
import { type Workspace, clearAll, getWorkspace, subscribe } from "./workspace.ts";

// Views derived from the practice workspace. `students` is a live binding: it is rebuilt whenever
// the workspace changes, and the app re-renders from the workspace store.

export interface GoalView {
  goal: Goal;
  effectiveFrom: string;
  effectiveTo: string;
  plan: MeasurementPlan;
  series: SeriesPoint[];
  progress: GoalProgress;
}

export interface StudentView {
  student: Student;
  goals: GoalView[];
  status: GoalProgress["status"];
  lastDataAt: string | undefined;
}

/**
 * What a role may see of a student. Decision (Sable's access review, 2026-10-20): gen-ed teachers
 * see the full name and grade by design, since they already hold their class roster; paras see a
 * first name only. Neither sees ids or the birth date.
 */
function maskFor(role: RoleId | null, s: Student): Student {
  if (role !== "paraprofessional" && role !== "gen_ed_teacher") return s;
  // Gen-ed teachers see the full name and grade (they already hold their class roster); paras
  // see a first name only. Neither sees ids or the birth date.
  if (role === "gen_ed_teacher")
    return { ...s, local_student_id: "", state_student_id: "", dob: "" };
  return {
    ...s,
    last_name: "",
    grade: "",
    local_student_id: "",
    state_student_id: "",
    dob: "",
  };
}

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Removes the student's last name from free text shown to paras and gen-ed teachers. */
export function scrub(text: string, s: Student): string {
  const last = s.last_name.trim();
  if (!last) return text;
  return text.replace(new RegExp(`\\s*(?<!\\w)${escapeRe(last)}(?!\\w)`, "gi"), "");
}

export function build(ws: Workspace, role: RoleId | null): StudentView[] {
  if (role === null) return [];
  const delegate = isDelegateRole(role);
  const delegated = new Set(ws.delegated);
  const served = new Set(ws.served);
  const byGoal = new Map<string, Workspace["points"]>();
  for (const p of ws.points) byGoal.set(p.goal_id, [...(byGoal.get(p.goal_id) ?? []), p]);
  const planFor = new Map(ws.plans.map((p) => [p.goal_id, p]));
  return ws.students
    .filter((student) => role !== "related_service_provider" || served.has(student.id))
    .map((student) => {
      const iep = ws.ieps.find((i) => i.student_id === student.id);
      const goals = ws.goals
        .filter((g) => g.iep_id === iep?.id)
        .sort((a, b) => a.sequence - b.sequence)
        .flatMap((goal): GoalView[] => {
          const plan = planFor.get(goal.id);
          if (!iep || !plan) return [];
          if (delegate && !delegated.has(goal.id)) return [];
          const series = seriesFor(byGoal.get(goal.id) ?? []);
          return [
            {
              goal:
                role === "paraprofessional"
                  ? {
                      ...goal,
                      statement: scrub(goal.statement, student),
                      baseline: scrub(goal.baseline, student),
                      criteria: scrub(goal.criteria, student),
                    }
                  : goal,
              effectiveFrom: iep.effective_from,
              effectiveTo: iep.effective_to,
              plan,
              series,
              progress: progressFor(series, plan, iep.effective_from, iep.effective_to),
            },
          ];
        });
      const lastDataAt = goals
        .flatMap((g) => g.series.map((s) => s.at))
        .sort()
        .at(-1);
      return {
        student: maskFor(role, student),
        goals,
        status: worstStatus(goals.map((g) => g.progress.status)),
        lastDataAt,
      };
    })
    .filter((v) => !delegate || v.goals.length > 0)
    .sort((a, b) => a.student.last_name.localeCompare(b.student.last_name));
}

// Stored data is validated when read; if a view still cannot be built, start over rather than
// leave the app blank with no way to reach Clear practice data.
function safeBuild(): StudentView[] {
  try {
    return build(getWorkspace(), getRole());
  } catch {
    clearAll();
    return [];
  }
}

export let students: StudentView[] = safeBuild();
subscribe(() => {
  students = safeBuild();
});
subscribeRole(() => {
  students = safeBuild();
});

// A neutral label for the practice page; the sample file carries its own tenant name.
export const districtName = "Practice district";

export function studentById(id: string): StudentView | undefined {
  return students.find((s) => s.student.id === id);
}

export function displayName(s: Student): string {
  return `${s.preferred_name ?? s.first_name} ${s.last_name}`.trim();
}

export const dataTotals = () => ({
  students: students.length,
  goals: students.reduce((n, s) => n + s.goals.length, 0),
});

export function goalById(
  studentId: string,
  goalId: string,
): { s: StudentView; g: GoalView } | undefined {
  const s = studentById(studentId);
  const g = s?.goals.find((x) => x.goal.id === goalId);
  return s && g ? { s, g } : undefined;
}

/** Goal counts for Home and the Caseload summary. "On track" includes met targets. */
export function goalCounts(list: StudentView[] = students) {
  const c = { goals: 0, onTrack: 0, needsLook: 0, met: 0, needsAttention: 0 };
  for (const s of list)
    for (const g of s.goals) {
      c.goals++;
      const st = g.progress.status;
      if (st === "met") c.met++;
      if (st === "met" || st === "on_track") c.onTrack++;
      else c.needsLook++;
      if (st === "needs_attention") c.needsAttention++;
    }
  return c;
}
