import raw from "@synthetic/fixtures/demo-district.json";
import type {
  DataPoint,
  Goal,
  MeasurementPlan,
  Student,
  SyntheticDistrict,
} from "@synthetic/src/types.ts";
import {
  type GoalProgress,
  type SeriesPoint,
  progressFor,
  seriesFor,
  worstStatus,
} from "./derive.ts";

// Slice one: the synthetic district is bundled into the app. Nothing here is fetched, stored in
// the browser, or cached by the service worker. Real data will come from the API.
const district = raw as unknown as SyntheticDistrict;
if (district.synthetic !== true) throw new Error("Refusing to load a dataset not marked synthetic");

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

const byGoal = new Map<string, DataPoint[]>();
for (const p of district.data_points) byGoal.set(p.goal_id, [...(byGoal.get(p.goal_id) ?? []), p]);
const planFor = new Map(district.measurement_plans.map((p) => [p.goal_id, p]));

export const students: StudentView[] = district.students
  .map((student) => {
    const iep = district.ieps.find((i) => i.student_id === student.id);
    const goals = district.goals
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
    return { student, goals, status: worstStatus(goals.map((g) => g.progress.status)), lastDataAt };
  })
  .sort((a, b) => a.student.last_name.localeCompare(b.student.last_name));

export const districtName = district.tenant.name;
export const staffName = district.staff.find((s) => s.role === "sped_director")?.display_name ?? "";

export function studentById(id: string): StudentView | undefined {
  return students.find((s) => s.student.id === id);
}

export function displayName(s: Student): string {
  return `${s.preferred_name ?? s.first_name} ${s.last_name}`;
}

export const dataTotals = {
  students: students.length,
  goals: students.reduce((n, s) => n + s.goals.length, 0),
  points: district.data_points.length,
};

export function goalById(
  studentId: string,
  goalId: string,
): { s: StudentView; g: GoalView } | undefined {
  const s = studentById(studentId);
  const g = s?.goals.find((x) => x.goal.id === goalId);
  return s && g ? { s, g } : undefined;
}
