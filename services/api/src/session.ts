import type { FastifyRequest } from "fastify";
import type { StaffRole } from "@iep/policies";

export type { StaffRole };

/**
 * What the data modules need to know about the caller. The auth module verifies the
 * session and sets `req.auth`; nothing here reads the tenant from client input.
 */
export interface Session {
  tenantId: string;
  staffId: string;
  role: StaffRole;
}

export class HttpProblem extends Error {
  readonly status: number;
  readonly title: string;

  constructor(status: number, title: string) {
    super(title);
    this.status = status;
    this.title = title;
  }
}

/** Returns the session or answers 401. Every data route calls this first. */
export function requireSession(req: FastifyRequest): Session {
  const p = req.auth?.principal;
  if (!p) throw new HttpProblem(401, "Unauthorized");
  return { tenantId: p.tenantId, staffId: p.staffId, role: p.role };
}
