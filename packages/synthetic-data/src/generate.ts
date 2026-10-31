import { firstNames, lastNames, staffNames } from "./names.ts";
import { Random } from "./random.ts";
import type {
  CaseloadAssignment,
  DataPoint,
  Goal,
  GoalDelegation,
  GoalArea,
  Iep,
  MeasurementPlan,
  MeasurementType,
  ProgressReport,
  ProgressReportState,
  ReportingPeriod,
  School,
  SchoolCalendar,
  Staff,
  StaffRole,
  Student,
  SyntheticDistrict,
} from "./types.ts";

export const GENERATOR_VERSION = "0.1.0";

/**
 * Fake 2026-27 days without school (weekends are implied): Labor Day, Oct 12, the Nov 9 staff day,
 * Thanksgiving break, winter break (students return Jan 5) and a few later holidays.
 */
const FAKE_NO_SCHOOL = [
  "2026-09-07",
  "2026-10-12",
  "2026-11-09",
  "2026-11-25",
  "2026-11-26",
  "2026-11-27",
  "2026-12-21",
  "2026-12-22",
  "2026-12-23",
  "2026-12-24",
  "2026-12-25",
  "2026-12-28",
  "2026-12-29",
  "2026-12-30",
  "2026-12-31",
  "2027-01-01",
  "2027-01-04",
  "2027-01-18",
  "2027-02-15",
  "2027-03-22",
  "2027-03-23",
  "2027-03-24",
  "2027-03-25",
  "2027-03-26",
  "2027-05-31",
];
export const DEFAULT_SEED = 20261017;

export interface GenerateOptions {
  seed?: number;
  studentCount?: number;
  /** First and last day of data collection (inclusive), YYYY-MM-DD. */
  dataFrom?: string;
  dataTo?: string;
}

interface GoalTemplate {
  area: GoalArea;
  type: MeasurementType;
  condition: string;
  behavior: string;
  criteria: string;
  baseline: string;
  target: string;
  targetValue: number;
  unit: string | null;
  trialsPerSession: number | null;
  promptHierarchy: string[];
  taskSteps: string[];
}

const PROMPTS = ["full physical", "partial physical", "model", "gestural", "verbal", "independent"];
const HANDWASHING = [
  "turn on water",
  "wet hands",
  "apply soap",
  "scrub 20 seconds",
  "rinse",
  "dry",
];

const TEMPLATES: GoalTemplate[] = [
  {
    area: "reading",
    type: "percent_correct",
    condition: "Given a short passage at the instructional level",
    behavior: "will answer literal comprehension questions",
    criteria: "with 80% accuracy in 4 of 5 consecutive sessions",
    baseline: "45% accuracy",
    target: "80% accuracy",
    targetValue: 80,
    unit: "percent",
    trialsPerSession: null,
    promptHierarchy: [],
    taskSteps: [],
  },
  {
    area: "math",
    type: "trials",
    condition: "Given 10 single-digit addition problems",
    behavior: "will write the correct sum",
    criteria: "for 8 of 10 problems in 3 consecutive sessions",
    baseline: "4 of 10 correct",
    target: "8 of 10 correct",
    targetValue: 8,
    unit: null,
    trialsPerSession: 10,
    promptHierarchy: [],
    taskSteps: [],
  },
  {
    area: "communication",
    type: "frequency",
    condition: "During a 20-minute structured play period",
    behavior: "will initiate a verbal interaction with a peer",
    criteria: "at least 5 times per period in 4 of 5 observations",
    baseline: "1 initiation per period",
    target: "5 initiations per period",
    targetValue: 5,
    unit: "initiations",
    trialsPerSession: null,
    promptHierarchy: [],
    taskSteps: [],
  },
  {
    area: "behavior",
    type: "duration",
    condition: "During independent seat work",
    behavior: "will remain on task without redirection",
    criteria: "for 10 consecutive minutes in 4 of 5 sessions",
    baseline: "3 minutes",
    target: "10 minutes",
    targetValue: 10,
    unit: "minutes",
    trialsPerSession: null,
    promptHierarchy: [],
    taskSteps: [],
  },
  {
    area: "adaptive",
    type: "task_analysis",
    condition: "Before lunch, using a picture schedule",
    behavior: "will complete the steps of handwashing",
    criteria: "independently for all 6 steps in 4 of 5 opportunities",
    baseline: "2 of 6 steps",
    target: "6 of 6 steps",
    targetValue: 6,
    unit: "steps",
    trialsPerSession: null,
    promptHierarchy: [],
    taskSteps: HANDWASHING,
  },
  {
    area: "written_expression",
    type: "rubric",
    condition: "Given a picture prompt and a graphic organizer",
    behavior: "will write a paragraph with a topic sentence and three details",
    criteria: "scoring 3 or higher on a 4-point rubric in 3 of 4 samples",
    baseline: "rubric score 1",
    target: "rubric score 3",
    targetValue: 3,
    unit: "rubric points",
    trialsPerSession: null,
    promptHierarchy: [],
    taskSteps: [],
  },
  {
    area: "social_emotional",
    type: "prompt_level",
    condition: "When frustrated during a classroom task",
    behavior: "will use a taught calming strategy",
    criteria: "at the independent prompt level in 4 of 5 opportunities",
    baseline: "model prompt",
    target: "independent",
    targetValue: PROMPTS.length - 1,
    unit: null,
    trialsPerSession: null,
    promptHierarchy: PROMPTS,
    taskSteps: [],
  },
];

const DAY_MS = 86_400_000;
/** Student index 3 gets an annual review due 2026-11-24 (meeting 364 days earlier). */
const DEMO_REVIEW_STUDENT = 3;
const DEMO_REVIEW_MEETING = "2025-11-25";

function parseDate(d: string): number {
  return Date.parse(`${d}T00:00:00Z`);
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function isoTime(ms: number): string {
  return new Date(ms).toISOString().replace(".000Z", "Z");
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Generates one synthetic State district. Same options always give byte-identical output. */
export function generateDistrict(opts: GenerateOptions = {}): SyntheticDistrict {
  const seed = opts.seed ?? DEFAULT_SEED;
  const studentCount = opts.studentCount ?? 12;
  const dataFrom = parseDate(opts.dataFrom ?? "2026-08-24");
  const dataTo = parseDate(opts.dataTo ?? "2026-10-16");
  const rng = new Random(seed);
  const created = parseDate("2026-08-01");

  const tenant = {
    id: rng.uuidv7(created),
    name: "Demo District (synthetic)",
    state_code: "NE",
    is_synthetic: true as const,
  };
  const t = tenant.id;

  const schools: School[] = [
    {
      id: rng.uuidv7(created),
      tenant_id: t,
      name: "Prairie Wind Elementary (synthetic)",
      grade_span: "K-5",
    },
    {
      id: rng.uuidv7(created),
      tenant_id: t,
      name: "Sandhill Middle (synthetic)",
      grade_span: "6-8",
    },
  ];

  const staffSpec: [StaffRole, number][] = [
    ["sped_director", 0],
    ["case_manager", 1],
    ["case_manager", 2],
    ["related_service_provider", 3],
    ["gen_ed_teacher", 4],
    ["paraprofessional", 5],
  ];
  const staff: Staff[] = staffSpec.map(([role, i]) => {
    const display_name = staffNames[i] ?? `Staff ${i}`;
    return {
      id: rng.uuidv7(created),
      tenant_id: t,
      email: `${display_name.toLowerCase().replace(/[^a-z]+/g, ".")}@bluestem.example`,
      display_name,
      role,
      status: "active",
    };
  });
  const byRole = (role: StaffRole) => staff.filter((s) => s.role === role);
  const director = byRole("sped_director")[0]!;
  const caseManagers = byRole("case_manager");
  const slp = byRole("related_service_provider")[0]!;
  const genEd = byRole("gen_ed_teacher")[0]!;

  const students: Student[] = [];
  const caseload_assignments: CaseloadAssignment[] = [];
  const ieps: Iep[] = [];
  const goals: Goal[] = [];
  const measurement_plans: MeasurementPlan[] = [];
  const data_points: DataPoint[] = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < studentCount; i++) {
    const elementary = i % 3 !== 2;
    const school = elementary ? schools[0]! : schools[1]!;
    const gradeNum = elementary ? rng.int(0, 5) : rng.int(6, 8);
    const grade = gradeNum === 0 ? "K" : String(gradeNum);
    let first: string;
    let last: string;
    do {
      first = rng.pick(firstNames);
      last = rng.pick(lastNames);
    } while (usedNames.has(`${first} ${last}`));
    usedNames.add(`${first} ${last}`);
    const birthYear = 2026 - 6 - gradeNum + (rng.chance(0.5) ? 0 : -1);
    const student: Student = {
      id: rng.uuidv7(created + i * 1000),
      tenant_id: t,
      school_id: school.id,
      first_name: first,
      last_name: last,
      preferred_name: rng.chance(0.2) ? first.slice(0, 3) : null,
      grade,
      local_student_id: `SYN-L${String(1000 + i).padStart(5, "0")}`,
      state_student_id: `SYN-S${String(rng.int(0, 99_999)).padStart(5, "0")}${String(i).padStart(2, "0")}`,
      dob: `${birthYear}-${String(rng.int(1, 12)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`,
    };
    students.push(student);

    const caseManager = caseManagers[i % caseManagers.length]!;
    const assign = (staffId: string, relationship: CaseloadAssignment["relationship"]) =>
      caseload_assignments.push({
        id: rng.uuidv7(created + i * 1000 + 1),
        tenant_id: t,
        staff_id: staffId,
        student_id: student.id,
        relationship,
        granted_by: director.id,
        start_date: "2026-08-13",
        end_date: null,
      });
    assign(caseManager.id, "caseload");
    if (elementary && i % 2 === 0) assign(genEd.id, "class_roster");

    const drawn = parseDate("2026-03-02") + rng.int(0, 150) * DAY_MS;
    // One invented annual review falls on 2026-11-24, inside the 30 days after both the Oct 30 and
    // Nov 16 demos, so "coming up" lists an IEP date as well as progress reports. The draw above
    // is still consumed, so nothing else in the seeded run moves.
    const meeting = i === DEMO_REVIEW_STUDENT ? parseDate(DEMO_REVIEW_MEETING) : drawn;
    const iep: Iep = {
      id: rng.uuidv7(meeting),
      tenant_id: t,
      student_id: student.id,
      plan_type: "iep",
      form_version: "nde_v2",
      status: "entered_in_srs",
      type: rng.chance(0.15) ? "initial" : "annual",
      meeting_date: isoDate(meeting),
      effective_from: isoDate(meeting + 7 * DAY_MS),
      effective_to: isoDate(meeting + 364 * DAY_MS),
      annual_review_due: isoDate(meeting + 364 * DAY_MS),
      reevaluation_due: isoDate(meeting + (365 * 3 - rng.int(0, 700)) * DAY_MS),
    };
    ieps.push(iep);

    const goalCount = rng.int(2, 3);
    const templates = rng.shuffle(TEMPLATES).slice(0, goalCount);
    let servedBySlp = false;
    templates.forEach((tpl, seq) => {
      const goal: Goal = {
        id: rng.uuidv7(meeting + seq + 1),
        tenant_id: t,
        iep_id: iep.id,
        area: tpl.area,
        statement: `${tpl.condition}, ${student.preferred_name ?? first} ${tpl.behavior} ${tpl.criteria}.`,
        condition: tpl.condition,
        behavior: tpl.behavior,
        baseline: tpl.baseline,
        target: tpl.target,
        criteria: tpl.criteria,
        sequence: seq,
      };
      goals.push(goal);
      if (tpl.area === "communication") servedBySlp = true;

      const plan: MeasurementPlan = {
        id: rng.uuidv7(meeting + seq + 2),
        tenant_id: t,
        goal_id: goal.id,
        type: tpl.type,
        unit: tpl.unit,
        target_value: tpl.targetValue,
        trials_per_session: tpl.trialsPerSession,
        prompt_hierarchy: tpl.promptHierarchy,
        task_steps: tpl.taskSteps,
        frequency: "2x weekly",
      };
      measurement_plans.push(plan);

      const collector = tpl.area === "communication" ? slp : caseManager;
      const device = rng.uuidv7(created + 5);
      // Progress starts near baseline and trends toward the target, with per-student pace.
      const pace = 0.4 + rng.next() * 0.7;
      const days = Math.round((dataTo - dataFrom) / DAY_MS);
      for (let d = 0; d <= days; d++) {
        const dayMs = dataFrom + d * DAY_MS;
        const weekday = new Date(dayMs).getUTCDay();
        if (weekday !== 2 && weekday !== 4) continue; // Tuesdays and Thursdays
        if (rng.chance(0.1)) continue; // absent or missed session
        const progress = clamp((d / days) * pace + (rng.next() - 0.5) * 0.25, 0, 1);
        const observed = dayMs + (14 + rng.int(0, 6)) * 3_600_000 + rng.int(0, 59) * 60_000;
        const point: DataPoint = {
          id: rng.uuidv7(observed),
          tenant_id: t,
          goal_id: goal.id,
          plan_id: plan.id,
          observed_at: isoTime(observed),
          value_num: null,
          correct: null,
          total: null,
          prompt_level: null,
          step_results: null,
          setting: rng.pick(["resource room", "general education classroom", "small group"]),
          note: rng.chance(0.15) ? "Synthetic note: worked well with a visual reminder." : null,
          collector_id: collector.id,
          device_id: device,
          client_created_at: isoTime(observed + rng.int(0, 120) * 1000),
        };
        fillValue(point, tpl, progress, rng);
        data_points.push(point);
      }
    });
    if (servedBySlp) assign(slp.id, "service");
  }

  const reporting_periods: ReportingPeriod[] = schools.flatMap((school) =>
    ["2026-10-16", "2026-12-18", "2027-03-12", "2027-05-21"].map((date) => ({
      id: rng.uuidv7(created),
      tenant_id: t,
      school_id: school.id,
      school_year: "2026-27",
      srs_report_date: date,
    })),
  );

  // Paras and gen-ed teachers see a student only through a delegated goal on top of an active
  // assignment, so the demo gives each of them a few. Built last so earlier ids stay the same.
  const goal_delegations: GoalDelegation[] = [];
  const para = byRole("paraprofessional")[0]!;
  const delegate = (
    to: Staff,
    studentIndex: number,
    relationship: CaseloadAssignment["relationship"],
  ) => {
    const student = students[studentIndex];
    const iep = student && ieps.find((x) => x.student_id === student.id);
    const goal = iep && goals.find((g) => g.iep_id === iep.id);
    const grantor =
      student &&
      caseload_assignments.find(
        (a) => a.student_id === student.id && a.relationship === "caseload",
      );
    if (!student || !goal || !grantor) return;
    if (!caseload_assignments.some((a) => a.staff_id === to.id && a.student_id === student.id)) {
      caseload_assignments.push({
        id: rng.uuidv7(created + 9000 + studentIndex),
        tenant_id: t,
        staff_id: to.id,
        student_id: student.id,
        relationship,
        granted_by: director.id,
        start_date: "2026-08-13",
        end_date: null,
      });
    }
    goal_delegations.push({
      id: rng.uuidv7(created + 9500 + studentIndex),
      tenant_id: t,
      goal_id: goal.id,
      staff_id: to.id,
      granted_by: grantor.staff_id,
      expires_at: null,
    });
  };
  delegate(para, 0, "delegated");
  delegate(para, 1, "delegated");
  delegate(genEd, 0, "class_roster");

  // Fake 2026-27 calendar and the Q1 progress reports (overdue progress reports).
  // Real dates come from the district; these only make the demo behave like a school year.
  const school_calendar: SchoolCalendar = {
    school_year: "2026-27",
    no_school_days: FAKE_NO_SCHOOL,
  };
  const q1 = reporting_periods.filter((p) => p.srs_report_date === "2026-10-16");
  // Six filed (four attested, two checked against the SRS PDF) and six waiting (two not started,
  // two drafted, one approved, one copied), spread over both buildings by student order.
  const q1States: ProgressReportState[] = [
    "filed_attested",
    "not_started",
    "verified_by_pdf",
    "drafted",
    "filed_attested",
    "approved",
    "filed_attested",
    "copied",
    "verified_by_pdf",
    "not_started",
    "filed_attested",
    "drafted",
  ];
  const progress_reports: ProgressReport[] = students.flatMap((student, i) => {
    const iep = ieps.find((x) => x.student_id === student.id);
    const period = q1.find((p) => p.school_id === student.school_id);
    const state = q1States[i % q1States.length]!;
    const manager = caseload_assignments.find(
      (a) => a.student_id === student.id && a.relationship === "caseload",
    );
    if (!iep || !period || !manager) return [];
    const filed = state === "filed_attested" || state === "verified_by_pdf";
    return [
      {
        id: rng.uuidv7(created + 9800 + i),
        tenant_id: t,
        iep_id: iep.id,
        reporting_period_id: period.id,
        due_date: "2026-10-23",
        state,
        srs_method: state === "not_started" ? null : ("paste_kit" as const),
        filed_attested_by: filed ? manager.staff_id : null,
        filed_attested_at: filed ? "2026-10-21T15:00:00Z" : null,
      },
    ];
  });

  return {
    synthetic: true,
    seed,
    generator_version: GENERATOR_VERSION,
    tenant,
    schools,
    staff,
    students,
    caseload_assignments,
    ieps,
    goals,
    measurement_plans,
    goal_delegations,
    data_points,
    reporting_periods,
    school_calendar,
    progress_reports,
  };
}

function baselineFraction(tpl: GoalTemplate): number {
  switch (tpl.type) {
    case "percent_correct":
      return 45 / tpl.targetValue;
    case "trials":
      return 4 / tpl.targetValue;
    case "frequency":
      return 1 / tpl.targetValue;
    case "duration":
      return 3 / tpl.targetValue;
    case "task_analysis":
      return 2 / tpl.targetValue;
    case "rubric":
      return 1 / tpl.targetValue;
    case "prompt_level":
      return 2 / tpl.targetValue;
    default:
      return 0.3;
  }
}

function fillValue(point: DataPoint, tpl: GoalTemplate, progress: number, rng: Random): void {
  const base = baselineFraction(tpl);
  const level = base + (1 - base) * progress; // fraction of the target reached
  switch (tpl.type) {
    case "percent_correct":
      point.value_num = Math.round(clamp(level * tpl.targetValue + rng.int(-5, 5), 0, 100));
      break;
    case "trials": {
      const total = tpl.trialsPerSession ?? 10;
      point.total = total;
      point.correct = clamp(Math.round(level * tpl.targetValue + rng.int(-1, 1)), 0, total);
      break;
    }
    case "frequency":
      point.value_num = Math.max(0, Math.round(level * tpl.targetValue + rng.int(-1, 1)));
      break;
    case "duration":
      point.value_num = Math.max(
        0,
        Math.round((level * tpl.targetValue + (rng.next() - 0.5)) * 10) / 10,
      );
      break;
    case "task_analysis": {
      const done = clamp(Math.round(level * tpl.taskSteps.length), 0, tpl.taskSteps.length);
      point.step_results = tpl.taskSteps.map((_, i) => i < done);
      point.correct = done;
      point.total = tpl.taskSteps.length;
      break;
    }
    case "rubric":
      point.value_num = clamp(Math.round(level * tpl.targetValue + rng.int(-1, 1) * 0.5), 1, 4);
      break;
    case "prompt_level": {
      const idx = clamp(Math.round(level * tpl.targetValue), 0, tpl.promptHierarchy.length - 1);
      point.prompt_level = tpl.promptHierarchy[idx] ?? null;
      point.value_num = idx;
      break;
    }
    default:
      point.value_num = Math.round(level * 100) / 100;
  }
}
