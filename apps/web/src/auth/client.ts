// The only file in the web app that talks to the sign-in server. It is built into the page only
// when the build has a sign-in server address (VITE_GOALLINE_API_ORIGIN); the default practice
// build never includes it. Paths are relative here and the built-in fetch puts the server address
// in front and sends the cookie along. The access token lives in memory only; the refresh token is an
// HttpOnly cookie the page cannot read.
import type { RoleId } from "../data/roles.ts";
import {
  CANT_FINISH,
  DEVICE_LIMIT,
  GENERIC,
  NO_SERVER,
  SETUP_NEEDED,
  errorMessage,
  problemLines,
  waitMessage,
} from "./messages.ts";
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
  | { kind: "signed_in"; me: Me; recoveryLeft?: number }
  | { kind: "pending" }
  | { kind: "second_factor"; challenge: string }
  | { kind: "enrol"; challenge: string }
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
  const ends = Date.parse(body.access_expires_at);
  // An unreadable end time would make the refresh timer fire at once and loop.
  if (Number.isNaN(ends)) return false;
  accessToken = body.access_token;
  expiresAt = ends;
  return true;
}

const fail = (message: string, lines: string[] = []) => ({
  kind: "error" as const,
  message,
  lines,
});

/** Turns a sign-in or set-password answer into what the screen does next. */
async function finish(route: Route, res: Response): Promise<Outcome> {
  const body = await json(res);
  // The server answers a waiting account with 403 { status: "pending" } (202 also accepted).
  if ((res.status === 202 || res.status === 403) && body?.status === "pending")
    return { kind: "pending" };
  // A person with no authenticator yet is turned away at the password step.
  if (res.status === 403 && body?.status === "second_factor_setup_needed")
    return fail(SETUP_NEEDED);
  if (res.status === 422) return fail("That password won't work.", problemLines(body?.problems));
  if (res.status !== 200)
    return fail(errorMessage(route, res.status, res.headers.get("Retry-After")));
  if (!body) return fail(NO_SERVER);
  // The challenge is kept by the screen, in memory only.
  if (
    (body.status === "second_factor" || body.status === "enrol_second_factor") &&
    typeof body.challenge === "string"
  )
    return {
      kind: body.status === "second_factor" ? "second_factor" : "enrol",
      challenge: body.challenge,
    };
  return signedIn(body);
}

async function signedIn(body: Record<string, unknown>): Promise<Outcome> {
  if (body.status !== "signed_in" || !keep(body)) return fail(CANT_FINISH);
  const me = await getMe();
  if (!me) return fail(GENERIC);
  const left = body.recovery_codes_left;
  return typeof left === "number"
    ? { kind: "signed_in", me, recoveryLeft: left }
    : { kind: "signed_in", me };
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

// ---- Second factor (spec section 6) ----

/** A 401 here means the code was wrong or the challenge ended; the screen stays, says to check the time on the phone, and offers "Start again". */
export async function secondFactor(
  challenge: string,
  entry: { code: string } | { recoveryCode: string },
): Promise<Outcome> {
  try {
    const res = await post("/v0/auth/second-factor", { challenge, ...entry, deviceId: deviceId() });
    const body = await json(res);
    if (res.status === 200) return body ? signedIn(body) : fail(NO_SERVER);
    return fail(errorMessage("second-factor", res.status, res.headers.get("Retry-After")));
  } catch {
    return fail(NO_SERVER);
  }
}

export type Enrol =
  | { kind: "key"; otpauthUri: string; secret: string }
  | { kind: "expired" }
  | { kind: "error"; message: string; lines: string[] };

export async function enrolStart(challenge: string): Promise<Enrol> {
  try {
    const res = await post("/v0/auth/second-factor/enrol", { challenge, deviceId: deviceId() });
    if (res.status === 401) return { kind: "expired" };
    const body = await json(res);
    if (res.status !== 200)
      return fail(errorMessage("enrol", res.status, res.headers.get("Retry-After")));
    if (typeof body?.otpauth_uri !== "string" || typeof body.secret !== "string")
      return fail(CANT_FINISH);
    return { kind: "key", otpauthUri: body.otpauth_uri, secret: body.secret };
  } catch {
    return fail(NO_SERVER);
  }
}

export type Confirm =
  | { kind: "codes"; codes: string[]; me: Me | null; after: string | null }
  | { kind: "error"; message: string; lines: string[] };

/** Recovery codes come back once; the screen shows them and never stores them. */
export async function enrolConfirm(challenge: string, code: string): Promise<Confirm> {
  try {
    const res = await post("/v0/auth/second-factor/enrol/confirm", {
      challenge,
      code,
      deviceId: deviceId(),
    });
    const body = await json(res);
    const codes = Array.isArray(body?.recovery_codes)
      ? body.recovery_codes.filter((c): c is string => typeof c === "string")
      : [];
    // 409 still carries the codes: show them, then the device-limit message.
    if (res.status === 409 && codes.length > 0)
      return { kind: "codes", codes, me: null, after: DEVICE_LIMIT };
    if (res.status !== 200 || !body)
      return fail(errorMessage("enrol", res.status, res.headers.get("Retry-After")));
    if (codes.length === 0) return fail(CANT_FINISH);
    const out = await signedIn(body);
    if (out.kind !== "signed_in") return fail(CANT_FINISH);
    return { kind: "codes", codes, me: out.me, after: null };
  } catch {
    return fail(NO_SERVER);
  }
}

/** Sign-up by picking a school: every answer after the checks is the same waiting screen. */
export const signUpSchool = (
  schoolId: string,
  email: string,
  displayName: string,
  password: string,
) =>
  call("signup-school", "/v0/auth/signup", {
    schoolId,
    email,
    displayName,
    password,
    deviceId: deviceId(),
  });

export interface School {
  id: string;
  name: string;
  town: string | null;
  district: string;
}

export type Found = { ok: true; schools: School[] } | { ok: false; message: string };

/** The caller waits about half a second between keystrokes and sends 3 to 60 characters. */
export async function searchSchools(q: string): Promise<Found> {
  try {
    const res = await doFetch(`/v0/auth/schools?q=${encodeURIComponent(q)}`, {
      headers: { "X-GoalLine-Client": "web" },
    });
    if (res.status === 429)
      return { ok: false, message: waitMessage(res.headers.get("Retry-After")) };
    const body = await json(res);
    if (res.status !== 200 || !Array.isArray(body?.schools)) return { ok: false, message: GENERIC };
    const schools: School[] = [];
    for (const s of body.schools as Record<string, unknown>[]) {
      if (typeof s.id !== "string" || typeof s.name !== "string") continue;
      schools.push({
        id: s.id,
        name: s.name,
        town: typeof s.town === "string" ? s.town : null,
        district: typeof s.district === "string" ? s.district : "",
      });
    }
    return { ok: true, schools: schools.slice(0, 8) };
  } catch {
    return { ok: false, message: NO_SERVER };
  }
}

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
] as const;
export type ApproveRole = (typeof APPROVE_ROLES)[number];

export interface Signup {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  expiresAt: string;
  via: "invite" | "school";
  /** School sign-ups only: false means the email is not one the district expects (a hint). */
  emailDomainMatched: boolean | null;
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

const adminError = (status: number, what: "invite" | "signup" | "listing" = "signup"): string =>
  status === 403
    ? "Only the director can do this."
    : status === 401
      ? "You were signed out. Sign in again."
      : status === 409
        ? what === "invite"
          ? "There are too many open invite codes. Wait for one to be used or to expire."
          : what === "listing"
            ? "The school list can't be opened until the district's first admin has been verified."
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
  what: "invite" | "signup" | "listing" = "signup",
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
        via: r.via === "school" ? "school" : "invite",
        emailDomainMatched:
          typeof r.email_domain_matched === "boolean" ? r.email_domain_matched : null,
      });
    }
    return out;
  });

export const approveSignup = (id: string, role: ApproveRole, endsOn: string) =>
  admin(
    `/v0/staff/signups/${encodeURIComponent(id)}/approve`,
    { method: "POST", body: JSON.stringify({ role, endsOn }) },
    201,
    (b) => ({
      role: str(b?.role) ?? role,
      // School sign-ups only: shown once in a dialog, never stored.
      setupCode: str(b?.setup_code),
      setupCodeExpiresAt: str(b?.setup_code_expires_at),
    }),
  );

/** Reject many at once; ids already gone are skipped by the server. */
export const rejectSignups = (ids: string[]) =>
  admin("/v0/staff/signups/reject", { method: "POST", body: JSON.stringify({ ids }) }, 200, (b) =>
    typeof b?.rejected === "number" ? b.rejected : null,
  );

/** Opens or closes the school list for this district (director only). */
export const setSchoolListing = (listed: boolean) =>
  admin(
    "/v0/staff/district/listing",
    { method: "POST", body: JSON.stringify({ listed }) },
    200,
    (b) => (typeof b?.listed === "boolean" ? b.listed : null),
    "listing",
  );

export const rejectSignup = (id: string) =>
  admin(
    `/v0/staff/signups/${encodeURIComponent(id)}/reject`,
    { method: "POST", body: "{}" },
    204,
    () => true,
  );
