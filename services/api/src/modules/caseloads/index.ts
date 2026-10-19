import { authzFor } from "../auth/endpoints.ts";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { FieldCrypto } from "../../crypto/fields.ts";
import { withTenant, type Db } from "../../db.ts";
import { HttpProblem, requireSession } from "../../session.ts";
import { importAssignments } from "./assignments.ts";
import { CsvError } from "./csv.ts";
import type { ColumnMapping } from "./mapping.ts";
import { importRoster, type DateFormat } from "./roster.ts";

interface ImportBody {
  csv: string;
  commit: boolean;
  mapping?: ColumnMapping;
  date_format?: DateFormat;
}

const IMPORT_ROLES = new Set(["sped_director", "building_coordinator"]);

function readBody(raw: unknown): ImportBody {
  const b = raw as Partial<ImportBody> | null;
  const mappingOk =
    b?.mapping === undefined ||
    (typeof b.mapping === "object" &&
      b.mapping !== null &&
      Object.values(b.mapping).every((v) => typeof v === "string"));
  if (
    !b ||
    typeof b.csv !== "string" ||
    typeof b.commit !== "boolean" ||
    !mappingOk ||
    (b.date_format !== undefined && b.date_format !== "iso" && b.date_format !== "mdy")
  ) {
    throw new HttpProblem(400, "Bad Request");
  }
  return b as ImportBody;
}

/**
 * Director-only CSV loads (architecture section 9.4). Every upload is a preview first: with
 * `commit: false` nothing is written and the report lists row-level problems; with `commit: true`
 * the file loads all-or-nothing, in one transaction. The CSV text is never stored or logged.
 * TODO(track 1): write the audit event for each import once the audit writer lands.
 */
export const caseloadsModule: FastifyPluginAsync<{ db: Db; crypto: FieldCrypto }> = async (
  app,
  { db, crypto },
) => {
  const run =
    (kind: "students" | "caseloads") => async (req: FastifyRequest, reply: FastifyReply) => {
      const session = requireSession(req);
      if (!IMPORT_ROLES.has(session.role)) throw new HttpProblem(403, "Forbidden");
      const body = readBody(req.body);
      try {
        // A commit takes the feed lock before it reads, so two imports of the same file queue
        // instead of both deciding to create the same students.
        const report = await withTenant(
          db,
          session,
          (c) =>
            kind === "students"
              ? importRoster(c, session, crypto, { ...body, dateFormat: body.date_format ?? "iso" })
              : importAssignments(c, session, crypto, body),
          { feedWriter: body.commit },
        );
        // A commit that found problems wrote nothing: say so with 422 and the report.
        if (body.commit && !report.committed) reply.code(422);
        return report;
      } catch (err) {
        if (err instanceof CsvError) throw new HttpProblem(400, `Bad CSV: ${err.code}`);
        throw err;
      }
    };
  app.post(
    "/v0/imports/students",
    { config: { authz: authzFor("importStudents") } },
    run("students"),
  );
  app.post(
    "/v0/imports/caseloads",
    { config: { authz: authzFor("importCaseloads") } },
    run("caseloads"),
  );
};
