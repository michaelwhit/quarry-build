import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Change } from "./changes.ts";
import { HttpProblem } from "../../session.ts";

type Tier = 1 | 2 | 3 | 4 | 5;

/** Fields a reader below S4 gets for a goal: assigned goals, text only. */
const GOAL_TEXT_ONLY = ["iep_id", "student_id", "area", "statement", "sequence"];

/**
 * Runs every student-scoped change in a page through the Cedar policies, one decision per
 * (tier, student, goal), and removes what the caller may not read. Decisions are audited by the
 * auth module. The SQL scope already narrowed the page; this is the authority. Runs after the
 * database transaction ends, so a decision never waits for a second connection while holding one.
 */
export async function authorizeChanges(
  app: FastifyInstance,
  req: FastifyRequest,
  changes: Change[],
): Promise<Change[]> {
  const memo = new Map<string, Promise<boolean>>();
  const can = (tier: Tier, student: string, goal?: string) => {
    const key = `${tier}|${student}|${goal ?? ""}`;
    let hit = memo.get(key);
    if (!hit) {
      hit = app
        .authorizeItem(req, { kind: "student", action: "ReadSection", tier }, student, goal)
        .then((r) => {
          // A failed policy or audit lookup must not look like a denial: the device would advance
          // its cursor past rows it was entitled to. Fail the whole page; the retry gets it all.
          if (r === "error") throw new HttpProblem(503, "Service Unavailable");
          return r === "allow";
        });
      memo.set(key, hit);
    }
    return hit;
  };
  const out: Change[] = [];
  for (const ch of changes) {
    const { scope, ...rest } = ch;
    if (!scope) {
      out.push(ch);
      continue;
    }
    const { student, goal } = scope;
    let keep: Change | undefined;
    switch (ch.entity) {
      case "student":
        keep = (await can(1, student)) ? rest : undefined;
        break;
      case "iep":
        keep = (await can(2, student)) ? rest : undefined;
        break;
      case "goal":
        if (await can(4, student, goal)) keep = rest;
        else if (await can(2, student, goal)) {
          keep = rest.row
            ? {
                ...rest,
                row: Object.fromEntries(
                  Object.entries(rest.row).filter(([k]) => GOAL_TEXT_ONLY.includes(k)),
                ),
              }
            : rest;
        }
        break;
      case "objective":
        keep = (await can(4, student, goal)) ? rest : undefined;
        break;
      default: // measurement_plan, data_point: working data
        keep = (await can(3, student, goal)) ? rest : undefined;
    }
    if (keep) out.push(keep);
  }
  return out;
}
