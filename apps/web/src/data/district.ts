import type { Goal, MeasurementPlan, Student } from "@synthetic/src/types.ts";
import {
  type GoalProgress,
  type SeriesPoint,
  progressFor,
  seriesFor,
  worstStatus,
} from "./derive.ts";
import { type Workspace, clearAll, getWorkspace, sampleDistrict, subscribe } from "./workspace.ts";

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

function build(ws: Workspace): StudentView[] {
  const byGoal = new Map<string, Workspace["points"]>();
  for (const p of ws.points) byGoal.set(p.goal_id, [...(byGoal.get(p.goal_id) ?? []), p]);
  const planFor = new Map(ws.plans.map((p) => [p.goal_id, p]));
  return ws.students
    .map((student) => {
      const iep = ws.ieps.find((i) => i.student_id === student.id);
      const goals = ws.goals
        .filter((g) => g.iep_id === iep?.id)
        .sort((a, b) => a.sequence - b.sequence)
        .flatMap((goal): GoalView[] => {
          const plan = planFor.get(goal.id);
          if (!iep || !plan) return [];
          const series = seriesFor(byGoal.get(goal.id) ?? []);
          return [
            {
              goal,
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
        student,
        goals,
        status: worstStatus(goals.map((g) => g.progress.status)),
        lastDataAt,
      };
    })
    .sort((a, b) => a.student.last_name.localeCompare(b.student.last_name));
}

// Stored data is validated when read; if a view still cannot be built, start over rather than
// leave the app blank with no way to reach Clear practice data.
function safeBuild(): StudentView[] {
  try {
    return build(getWorkspace());
  } catch {
    clearAll();
    return [];
  }
}

export let students: StudentView[] = safeBuild();
subscribe(() => {
  students = safeBuild();
});

export const districtName = sampleDistrict.tenant.name;
export const staffName =
  sampleDistrict.staff.find((s) => s.role === "sped_director")?.display_name ?? "";

export function studentById(id: string): StudentView | undefined {
  return students.find((s) => s.student.id === id);
}

export function displayName(s: Student): string {
  return `${s.preferred_name ?? s.first_name} ${s.last_name}`;
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
