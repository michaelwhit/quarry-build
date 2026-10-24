/** Screens whose heading is fixed text. Anywhere else (a student, a goal) the title stays generic so no name reaches the tab or history. */
const FIXED_TITLE_ROUTES = new Set([
  "",
  "#/",
  "#/today",
  "#/caseload",
  "#/libraries",
  "#/libraries/accommodations",
  "#/more",
  "#/due",
  "#/overdue",
  "#/add-student",
  "#/import-students",
  "#/evaluation",
  "#/meeting-notices",
  "#/staff",
  "#/access-review",
]);

export function pageTitle(hash: string, heading: string | null): string {
  if (FIXED_TITLE_ROUTES.has(hash) && heading) return `${heading} · GoalLine`;
  return /^#\/(student|track|glance)/.test(hash) ? "Student · GoalLine" : "GoalLine";
}
