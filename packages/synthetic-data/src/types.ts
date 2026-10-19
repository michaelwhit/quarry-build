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
  data_points: DataPoint[];
  reporting_periods: ReportingPeriod[];
}
