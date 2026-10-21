// The only file in the web app that talks to the sign-in server. It is built into the page only
// when the build has a sign-in server address (VITE_GOALLINE_API_ORIGIN); the default practice
// build never includes it. Paths are relative here and the built-in fetch puts the server address
// in front and sends the cookie along. The access token lives in memory only; the refresh token is an
// HttpOnly cookie the page cannot read.
import type { RoleId } from "../data/roles.ts";
import { CANT_FINISH, GENERIC, NO_SERVER, errorMessage, problemLines } from "./messages.ts";
import type { Route } from "./messages.ts";

const ROLE_IDS: readonly RoleId[] = [
  "sped_director",
  "case_manager",
  "related_service_provider",
  "paraprofessional",
  "gen_ed_teacher",
];

export interface Me {
  id: string;
  displayName: string;
  email: string;
  role: RoleId;
}

export type Outcome =
  | { kind: "signed_in"; me: Me }
  | { kind: "pending" }
  | { kind: "error"; message: string; lines: string[] };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
/** The built-in fetch: the sign-in server's address in front of the path, cookie included. */
export function serverFetch(origin: string): FetchLike {
  return (input, init) => globalThis.fetch(origin + input, { ...init, credentials: "include" });
}
const builtIn = serverFetch(import.meta.env.VITE_GOALLINE_API_ORIGIN ?? "");
let doFetch: FetchLike = builtIn;
/** Tests only. */
export function useFetch(f: FetchLike | null) {
  doFetch = f ?? builtIn;
}

let accessToken: string | null = null;
let expiresAt = 0;
export const hasToken = () => accessToken !== null;
export const tokenExpiresAt = () => expiresAt;
export function forgetToken() {
  accessToken = null;
  expiresAt = 0;
}

let memoryDeviceId: string | null = null;
/** A random id made once per browser. Not a secret; no token is ever stored. */
export function deviceId(): string {
  try {
    const have = globalThis.localStorage.getItem("goalline.deviceId");
    if (have) return have;
    memoryDeviceId ??= globalThis.crypto.randomUUID();
    globalThis.localStorage.setItem("goalline.deviceId", memoryDeviceId);
    return memoryDeviceId;
  } catch {
    // No usable storage (private window): the id lasts for this page only.
    memoryDeviceId ??= globalThis.crypto.randomUUID();
    return memoryDeviceId;
  }
}

const CLIENT = { "X-GoalLine-Client": "web", "Content-Type": "application/json" };

async function post(path: string, body: unknown): Promise<Response> {
  return doFetch(path, { method: "POST", headers: CLIENT, body: JSON.stringify(body) });
}

async function json(res: Response): Promise<Record<string, unknown> | null> {
  const type = res.headers.get("Content-Type") ?? "";
  if (!type.includes("json")) return null;
  try {
    const v: unknown = await res.json();
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function keep(body: Record<string, unknown>): boolean {
  if (typeof body.access_token !== "string" || typeof body.access_expires_at !== "string")
    return false;
  accessToken = body.access_token;
  expiresAt = Date.parse(body.access_expires_at);
  return true;
}

const fail = (message: string, lines: string[] = []): Outcome => ({
  kind: "error",
  message,
  lines,
});

/** Turns a sign-in or set-password answer into what the screen does next. */
async function finish(route: Route, res: Response): Promise<Outcome> {
  const body = await json(res);
  // The server answers a waiting account with 403 { status: "pending" } (202 also accepted).
  if ((res.status === 202 || res.status === 403) && body?.status === "pending")
    return { kind: "pending" };
  if (res.status === 422) return fail("That password won't work.", problemLines(body?.problems));
  if (res.status !== 200)
    return fail(errorMessage(route, res.status, res.headers.get("Retry-After")));
  if (!body) return fail(NO_SERVER);
  if (body.status !== "signed_in" || !keep(body)) return fail(CANT_FINISH);
  const me = await getMe();
  return me ? { kind: "signed_in", me } : fail(GENERIC);
}

async function call(route: Route, path: string, body: unknown): Promise<Outcome> {
  try {
    return await finish(route, await post(path, body));
  } catch {
    return fail(NO_SERVER);
  }
}

export const signIn = (email: string, password: string) =>
  call("password", "/v0/auth/password", { email, password, deviceId: deviceId() });

export const setPassword = (email: string, code: string, password: string) =>
  call("set-password", "/v0/auth/set-password", { email, code, password, deviceId: deviceId() });

export const signUp = (code: string, email: string, displayName: string, password: string) =>
  call("signup", "/v0/auth/signup", { code, email, displayName, password, deviceId: deviceId() });

/** Tabs take turns: the refresh token rotates, so a second tab must send the rotated cookie. */
async function locked<T>(fn: () => Promise<T>): Promise<T> {
  const locks = globalThis.navigator?.locks;
  return locks ? locks.request("goalline-refresh", fn) : fn();
}

export type Refresh = "ok" | "signed_out" | "no_server";

export async function refresh(): Promise<Refresh> {
  return locked(async () => {
    try {
      const res = await post("/v0/auth/web/refresh", { deviceId: deviceId() });
      if (res.status === 401) return "signed_out";
      const body = await json(res);
      // A non-JSON or 404 answer means there is no sign-in server here.
      if (res.status !== 200 || !body) return "no_server";
      return keep(body) ? "ok" : "no_server";
    } catch {
      return "no_server";
    }
  });
}

async function fetchMe(): Promise<Response> {
  return doFetch("/v0/me", { headers: { Authorization: `Bearer ${accessToken ?? ""}` } });
}

export async function getMe(): Promise<Me | null> {
  try {
    let res = await fetchMe();
    if (res.status === 401 && (await refresh()) === "ok") res = await fetchMe();
    if (res.status !== 200) return null;
    const b = await json(res);
    const role = ROLE_IDS.find((r) => r === b?.role);
    if (!b || !role || typeof b.id !== "string" || typeof b.email !== "string") return null;
    return {
      id: b.id,
      displayName: typeof b.display_name === "string" ? b.display_name : b.email,
      email: b.email,
      role,
    };
  } catch {
    return null;
  }
}

/** Always ends the session on this device, even when the server cannot be reached. */
export async function signOut(): Promise<void> {
  forgetToken();
  try {
    await post("/v0/auth/web/logout", { deviceId: deviceId() });
  } catch {
    // The cookie expires on its own; nothing more to do here.
  }
}

// ---- Director only: invite codes and the Pending list (PR B routes, section 6a of the spec) ----

export const APPROVE_ROLES = [
  "case_manager",
  "related_service_provider",
  "paraprofessional",
  "gen_ed_teacher",
  "building_coordinator",
] as const;
export type ApproveRole = (typeof APPROVE_ROLES)[number];

export interface Signup {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  expiresAt: string;
}

/** A request with the access token; one refresh and retry when the token has ended. */
async function authed(path: string, init: RequestInit): Promise<Response> {
  const send = () =>
    doFetch(path, {
      ...init,
      headers: { ...CLIENT, Authorization: `Bearer ${accessToken ?? ""}` },
    });
  let res = await send();
  if (res.status === 401 && (await refresh()) === "ok") res = await send();
  return res;
}

const adminError = (status: number, what: "invite" | "signup" = "signup"): string =>
  status === 403
    ? "Only the director can do this."
    : status === 401
      ? "You were signed out. Sign in again."
      : status === 409
        ? what === "invite"
          ? "There are too many open invite codes. Wait for one to be used or to expire."
          : "Someone already has this email. Reject this sign-up or check Staff."
        : status === 404
          ? "That sign-up is gone. It may already be handled."
          : status === 400
            ? "That role or end date is not allowed."
            : GENERIC;

export type Made<T> = { ok: true; value: T } | { ok: false; message: string };

async function admin<T>(
  path: string,
  init: RequestInit,
  okStatus: number,
  read: (b: Record<string, unknown> | null) => T | null,
  what: "invite" | "signup" = "signup",
): Promise<Made<T>> {
  try {
    const res = await authed(path, init);
    if (res.status !== okStatus) return { ok: false, message: adminError(res.status, what) };
    const v = read(await json(res));
    return v === null ? { ok: false, message: GENERIC } : { ok: true, value: v };
  } catch {
    return { ok: false, message: NO_SERVER };
  }
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** The code is shown once and never stored. */
export const createInvite = () =>
  admin(
    "/v0/auth/invites",
    { method: "POST", body: "{}" },
    201,
    (b) => {
      const code = str(b?.code);
      const expires = str(b?.expires_at);
      return code && expires ? { code, expiresAt: expires } : null;
    },
    "invite",
  );

export const listSignups = () =>
  admin("/v0/staff/signups", { method: "GET" }, 200, (b) => {
    const rows = b?.signups;
    if (!Array.isArray(rows)) return null;
    const out: Signup[] = [];
    for (const r of rows as Record<string, unknown>[]) {
      const id = str(r.id);
      const email = str(r.email);
      if (!id || !email) return null;
      out.push({
        id,
        email,
        displayName: str(r.display_name) ?? email,
        createdAt: str(r.created_at) ?? "",
        expiresAt: str(r.expires_at) ?? "",
      });
    }
    return out;
  });

export const approveSignup = (id: string, role: ApproveRole, endsOn: string) =>
  admin(
    `/v0/staff/signups/${encodeURIComponent(id)}/approve`,
    { method: "POST", body: JSON.stringify({ role, endsOn }) },
    201,
    (b) => ({ role: str(b?.role) ?? role }),
  );

export const rejectSignup = (id: string) =>
  admin(
    `/v0/staff/signups/${encodeURIComponent(id)}/reject`,
    { method: "POST", body: "{}" },
    204,
    () => true,
  );
