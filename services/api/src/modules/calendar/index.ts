import { authzFor } from "../auth/endpoints.ts";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { withTenant, type Db } from "../../db.ts";
import { uuidv7 } from "../../ids.ts";
import { HttpProblem, requireSession, type Session } from "../../session.ts";
import { parseDate } from "../caseloads/roster.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EDIT_ROLES = new Set(["sped_director", "building_coordinator"]);

/** "2026-27" runs 2026-08-01 to 2027-07-31. Returns undefined for anything else. */
function schoolYearRange(year: unknown): { from: string; to: string } | undefined {
  const m = typeof year === "string" ? /^(20\d{2})-(\d{2})$/.exec(year) : null;
  if (!m || Number(m[2]) !== (Number(m[1]) + 1) % 100) return undefined;
  return { from: `${m[1]}-08-01`, to: `${Number(m[1]) + 1}-07-31` };
}

/** Validates the body: a school year and 1 to 400 distinct dates inside it. */
function readDates(raw: unknown): { year: string; dates: string[] } {
  const b = raw as { school_year?: unknown; dates?: unknown } | null;
  const range = schoolYearRange(b?.school_year);
  if (!range || !Array.isArray(b?.dates) || b.dates.length === 0 || b.dates.length > 400) {
    throw new HttpProblem(400, "Bad Request");
  }
  const dates = new Set<string>();
  for (const d of b.dates) {
    const iso = typeof d === "string" ? parseDate(d, "iso") : undefined;
    if (!iso || iso !== d || iso < range.from || iso > range.to)
      throw new HttpProblem(400, "Bad Request");
    dates.add(iso);
  }
  return { year: b.school_year as string, dates: [...dates] };
}

/**
 * The dates the Rule 51 engine counts against: SRS progress-report dates and instructional days.
 * Add-only: a mistaken date is fixed by the district's calendar owner in a later release, not by
 * deleting history the deadlines were computed from.
 */
export const calendarModule: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  const add =
    (table: "reporting_period" | "district_calendar") =>
    async (req: FastifyRequest<{ Params: { schoolId: string } }>) => {
      const session: Session = requireSession(req);
      if (!EDIT_ROLES.has(session.role)) throw new HttpProblem(403, "Forbidden");
      if (!UUID.test(req.params.schoolId)) throw new HttpProblem(404, "Not Found");
      const { year, dates } = readDates(req.body);
      return withTenant(
        db,
        session,
        async (c) => {
          const school = await c.query(
            "SELECT 1 FROM school WHERE id = $1 AND deleted_at IS NULL",
            [req.params.schoolId],
          );
          if (school.rowCount === 0) throw new HttpProblem(404, "Not Found");
          const ids = dates.map(() => uuidv7());
          const sql =
            table === "reporting_period"
              ? `INSERT INTO reporting_period (id, tenant_id, school_id, school_year, srs_report_date, created_by, updated_by)
               SELECT i, $1, $2, $3, d, $4, $4 FROM unnest($5::uuid[], $6::date[]) AS t(i, d)
               ON CONFLICT (school_id, srs_report_date) DO NOTHING`
              : `INSERT INTO district_calendar (id, tenant_id, school_id, school_year, instructional_day)
               SELECT i, $1, $2, $3, d FROM unnest($5::uuid[], $6::date[]) AS t(i, d)
               WHERE $4::uuid IS NOT NULL
               ON CONFLICT (school_id, instructional_day) DO NOTHING`;
          const res = await c.query(sql, [
            session.tenantId,
            req.params.schoolId,
            year,
            session.staffId,
            ids,
            dates,
          ]);
          const added = res.rowCount ?? 0;
          return { added, existing: dates.length - added };
        },
        { feedWriter: true },
      );
    };
  app.post<{ Params: { schoolId: string } }>(
    "/v0/schools/:schoolId/reporting-periods",
    { config: { authz: authzFor("addReportingPeriods") } },
    add("reporting_period"),
  );
  app.post<{ Params: { schoolId: string } }>(
    "/v0/schools/:schoolId/calendar",
    { config: { authz: authzFor("addInstructionalDays") } },
    add("district_calendar"),
  );
};
