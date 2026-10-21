// Shapes match the schema v0 columns (packages/db) in snake_case, with plaintext where the
// database stores ciphertext. Swift CoreModels decodes this file in its tests, so a change here
// is a contract change (see CONTRIBUTING.md).

export type StaffRole =
  | "sped_director"
  | "building_coordinator"
  | "case_manager"
  | "related_service_provider"
  | "gen_ed_teacher"
  | "paraprofessional"
  | "district_it_admin"
  | "vendor_support";

export type MeasurementType =
  | "percent_correct"
  | "trials"
  | "frequency"
  | "rate"
  | "duration"
  | "latency"
  | "rubric"
  | "prompt_level"
  | "task_analysis"
  | "yes_no";

export type GoalArea =
  | "reading"
  | "written_expression"
  | "math"
  | "communication"
  | "social_emotional"
  | "behavior"
  | "adaptive"
  | "motor"
  | "transition"
  | "other";

export interface Tenant {
  id: string;
  name: string;
  state_code: string;
  is_synthetic: true;
}

export interface School {
  id: string;
  tenant_id: string;
  name: string;
  grade_span: string;
}

export interface Staff {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  role: StaffRole;
  status: "active";
}

export interface Student {
  id: string;
  tenant_id: string;
  school_id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  grade: string;
  local_student_id: string;
  state_student_id: string;
  dob: string;
}

export interface CaseloadAssignment {
  id: string;
  tenant_id: string;
  staff_id: string;
  student_id: string;
  relationship: "caseload" | "service" | "class_roster" | "delegated";
  granted_by: string;
  start_date: string;
  end_date: string | null;
}

export interface GoalDelegation {
  id: string;
  tenant_id: string;
  goal_id: string;
  staff_id: string;
  granted_by: string;
  expires_at: string | null;
}

export interface Iep {
  id: string;
  tenant_id: string;
  student_id: string;
  plan_type: "iep";
  form_version: "nde_v2";
  status: "entered_in_srs";
  type: "annual" | "initial";
  meeting_date: string;
  effective_from: string;
  effective_to: string;
  annual_review_due: string;
  reevaluation_due: string;
}

export interface Goal {
  id: string;
  tenant_id: string;
  iep_id: string;
  area: GoalArea;
  statement: string;
  condition: string;
  behavior: string;
  baseline: string;
  target: string;
  criteria: string;
  sequence: number;
}

export interface MeasurementPlan {
  id: string;
  tenant_id: string;
  goal_id: string;
  type: MeasurementType;
  unit: string | null;
  target_value: number;
  trials_per_session: number | null;
  prompt_hierarchy: string[];
  task_steps: string[];
  frequency: string;
}

export interface DataPoint {
  id: string;
  tenant_id: string;
  goal_id: string;
  plan_id: string;
  observed_at: string;
  value_num: number | null;
  correct: number | null;
  total: number | null;
  prompt_level: string | null;
  step_results: boolean[] | null;
  setting: string;
  note: string | null;
  collector_id: string;
  device_id: string;
  client_created_at: string;
}

export interface ReportingPeriod {
  id: string;
  tenant_id: string;
  school_id: string;
  school_year: string;
  srs_report_date: string;
}

export type ProgressReportState =
  "not_started" | "drafted" | "approved" | "copied" | "filed_attested" | "verified_by_pdf";

/** One SRS progress report for one IEP and one reporting period (architecture 5.2, 9.2a). */
export interface ProgressReport {
  id: string;
  tenant_id: string;
  iep_id: string;
  reporting_period_id: string;
  /** When the report is due. The first overdue day is the next school day after it. */
  due_date: string;
  state: ProgressReportState;
  srs_method: "paste_kit" | "pdf_appendix" | null;
  filed_attested_by: string | null;
  filed_attested_at: string | null;
}

/** Days with no school (breaks, holidays, staff PD days) for one school year. Weekends are implied. */
export interface SchoolCalendar {
  school_year: string;
  no_school_days: string[];
}

export interface SyntheticDistrict {
  /** Marks the file as fake data. Tools refuse to load a dataset without it. */
  synthetic: true;
  seed: number;
  generator_version: string;
  tenant: Tenant;
  schools: School[];
  staff: Staff[];
  students: Student[];
  caseload_assignments: CaseloadAssignment[];
  ieps: Iep[];
  goals: Goal[];
  measurement_plans: MeasurementPlan[];
  goal_delegations: GoalDelegation[];
  data_points: DataPoint[];
  reporting_periods: ReportingPeriod[];
  school_calendar: SchoolCalendar;
  progress_reports: ProgressReport[];
}
