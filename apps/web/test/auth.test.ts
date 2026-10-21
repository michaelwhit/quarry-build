import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  approveSignup,
  createInvite,
  deviceId,
  listSignups,
  rejectSignup,
  forgetToken,
  enrolConfirm,
  enrolStart,
  secondFactor,
  getMe,
  hasToken,
  refresh,
  setPassword,
  signIn,
  signOut,
  signUp,
  serverFetch,
  useFetch,
} from "../src/auth/client.ts";
import { begin, currentPerson } from "../src/auth/session.ts";
import { onSignOut, setRole } from "../src/data/roles.ts";
import { AuthPanel, groupKey } from "../src/auth/AuthPanel.tsx";
import { PendingList, defaultEndsOn } from "../src/auth/PendingList.tsx";
import { errorMessage, waitMessage } from "../src/auth/messages.ts";

interface Call {
  path: string;
  init: RequestInit | undefined;
}
let calls: Call[] = [];

const reply = (status: number, body?: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? headers : { "Content-Type": "application/json", ...headers },
  });

function server(answers: Record<string, () => Response>) {
  useFetch(async (path, init) => {
    calls.push({ path, init });
    const a = answers[path];
    if (!a) throw new Error(`unexpected ${path}`);
    return a();
  });
}

const signedIn = {
  status: "signed_in",
  access_token: "tok",
  access_expires_at: "2030-01-01T00:00:00Z",
  session_id: "s1",
};
const me = { id: "u1", display_name: "Pat Case", email: "pat@example.test", role: "case_manager" };

beforeEach(() => {
  calls = [];
  forgetToken();
});
afterEach(() => useFetch(null));

describe("password sign-in client", () => {
  it("signs in, sends the web header and the device id, and reads who the person is", async () => {
    server({ "/v0/auth/password": () => reply(200, signedIn), "/v0/me": () => reply(200, me) });
    const out = await signIn("pat@example.test", "a long passphrase here");
    expect(out).toMatchObject({ kind: "signed_in", me: { role: "case_manager" } });
    const first = calls[0]!;
    expect(first.path).toBe("/v0/auth/password");
    expect((first.init?.headers as Record<string, string>)["X-GoalLine-Client"]).toBe("web");
    expect(JSON.parse(String(first.init?.body))).toMatchObject({ deviceId: deviceId() });
    expect((calls[1]!.init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(hasToken()).toBe(true);
  });

  it("gives the same line for every 401, and never shows the server's own text", async () => {
    server({ "/v0/auth/password": () => reply(401, { title: "no such user" }) });
    const out = await signIn("x@example.test", "pw");
    expect(out).toEqual({
      kind: "error",
      message: "That email and password don't match an account that can sign in.",
      lines: [],
    });
    expect(hasToken()).toBe(false);
  });

  it("rounds a Retry-After up to whole minutes", async () => {
    expect(waitMessage("61")).toBe("Too many tries. Wait 2 minutes and try again.");
    expect(waitMessage("30")).toBe("Too many tries. Wait a minute and try again.");
    expect(errorMessage("password", 429, "900")).toBe(
      "Too many tries. Wait 15 minutes and try again.",
    );
    expect(errorMessage("password", 409, null)).toContain("two other devices");
  });

  it("cannot finish an unknown status, and keeps no token", async () => {
    server({
      "/v0/auth/password": () => reply(200, { status: "something_newer", challenge: "c" }),
    });
    const out = await signIn("a@example.test", "pw");
    expect(out).toMatchObject({ kind: "error" });
    expect((out as { message: string }).message).toContain("can't finish signing in");
    expect(hasToken()).toBe(false);
  });

  it("shows one line per broken password rule on set-password and ignores unknown rules", async () => {
    server({
      "/v0/auth/set-password": () => reply(422, { problems: ["too_short", "common", "new_rule"] }),
    });
    const out = await setPassword("a@example.test", "K7QF-M2XD-9RTB-WC4H", "short");
    expect(out).toMatchObject({ kind: "error" });
    expect((out as { lines: string[] }).lines).toEqual([
      "Use at least 14 characters.",
      "That password is too common or has appeared in a data breach. Pick another.",
    ]);
  });

  it("says a wrong or used code in one way", async () => {
    server({ "/v0/auth/set-password": () => reply(401) });
    const out = await setPassword("a@example.test", "bad", "x");
    expect((out as { message: string }).message).toContain("Ask your director for a new one");
  });

  it("sign-up answers pending with no session", async () => {
    server({ "/v0/auth/signup": () => reply(202, { status: "pending" }) });
    expect(await signUp("INV", "a@example.test", "A B", "a long passphrase here")).toEqual({
      kind: "pending",
    });
    expect(JSON.parse(String(calls[0]!.init?.body))).toMatchObject({
      code: "INV",
      displayName: "A B",
    });
    expect(hasToken()).toBe(false);
  });

  it("sign-up answers pending the way the server does, 403 with status pending, and keeps no token", async () => {
    server({ "/v0/auth/signup": () => reply(403, { status: "pending" }) });
    expect(await signUp("INV", "a@example.test", "A B", "a long passphrase here")).toEqual({
      kind: "pending",
    });
    expect(hasToken()).toBe(false);
  });

  it("a 403 without the pending status is an ordinary error", async () => {
    server({ "/v0/auth/signup": () => reply(403, { title: "forbidden" }) });
    const out = await signUp("INV", "a@example.test", "A B", "a long passphrase here");
    expect(out.kind).toBe("error");
  });

  it("says the server cannot be reached when the request throws", async () => {
    useFetch(async () => {
      throw new TypeError("offline");
    });
    const out = await signIn("a@example.test", "pw");
    expect((out as { message: string }).message).toContain("Can't reach the GoalLine server");
  });

  it("refresh: 401 is signed out; a non-JSON answer means no server here", async () => {
    server({ "/v0/auth/web/refresh": () => reply(401) });
    expect(await refresh()).toBe("signed_out");
    server({ "/v0/auth/web/refresh": () => new Response("<html></html>", { status: 200 }) });
    expect(await refresh()).toBe("no_server");
    server({ "/v0/auth/web/refresh": () => reply(404) });
    expect(await refresh()).toBe("no_server");
    server({ "/v0/auth/web/refresh": () => reply(200, signedIn) });
    expect(await refresh()).toBe("ok");
    expect(hasToken()).toBe(true);
  });

  it("refreshes once when /v0/me says the token ended, and retries", async () => {
    let n = 0;
    server({
      "/v0/auth/web/refresh": () => reply(200, signedIn),
      "/v0/me": () => (n++ === 0 ? reply(401) : reply(200, me)),
    });
    expect((await getMe())?.email).toBe("pat@example.test");
    expect(calls.map((c) => c.path)).toEqual(["/v0/me", "/v0/auth/web/refresh", "/v0/me"]);
  });

  it("rejects a role the app does not know", async () => {
    server({ "/v0/me": () => reply(200, { ...me, role: "superuser" }) });
    expect(await getMe()).toBeNull();
  });

  it("sign-out forgets the token first and calls the web logout route without a Bearer", async () => {
    server({ "/v0/auth/password": () => reply(200, signedIn), "/v0/me": () => reply(200, me) });
    await signIn("pat@example.test", "pw");
    server({ "/v0/auth/web/logout": () => reply(204) });
    await signOut();
    expect(hasToken()).toBe(false);
    expect(calls.at(-1)!.path).toBe("/v0/auth/web/logout");
    expect((calls.at(-1)!.init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("signs out locally even when the server cannot be reached", async () => {
    server({ "/v0/auth/password": () => reply(200, signedIn), "/v0/me": () => reply(200, me) });
    await signIn("pat@example.test", "pw");
    useFetch(async () => {
      throw new TypeError("offline");
    });
    await signOut();
    expect(hasToken()).toBe(false);
  });
});

describe("password screens", () => {
  it("sign-in form uses the field types and autocomplete values the spec asks for", () => {
    const html = renderToString(createElement(AuthPanel, { onBack: () => {} }));
    expect(html).toContain('type="email"');
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('type="password"');
    expect(html).toContain("Show password");
    expect(html).toContain("I have an invite code");
    expect(html).not.toContain("Practice Director");
  });

  it("the pending list needs a role before Approve and asks twice before Reject", () => {
    const people = [
      { id: "p1", displayName: "Sam Q", email: "sam@example.test", requestedAt: "2026-10-21" },
    ];
    const none = { approve: async () => null, reject: async () => null };
    const html = renderToString(
      createElement(PendingList, { people, actions: none, onChanged: () => {} }),
    );
    expect(html).toContain("Waiting for approval (1)");
    expect(html).toContain("Choose a role");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Approve</);
    expect(html).not.toContain("Yes, reject");
    const empty = renderToString(
      createElement(PendingList, { people: [], actions: none, onChanged: () => {} }),
    );
    expect(empty).toContain("No one is waiting.");
  });
});

describe("director routes", () => {
  it("makes an invite code with the director's token and shows it once", async () => {
    server({
      "/v0/auth/password": () => reply(200, signedIn),
      "/v0/me": () => reply(200, { ...me, role: "sped_director" }),
      "/v0/auth/invites": () =>
        reply(201, { code: "K7QF-M2XD-9RTB-WC4H", expires_at: "2026-10-23T00:00:00Z" }),
    });
    await signIn("d@example.test", "pw");
    const r = await createInvite();
    expect(r).toEqual({
      ok: true,
      value: { code: "K7QF-M2XD-9RTB-WC4H", expiresAt: "2026-10-23T00:00:00Z" },
    });
    const call = calls.at(-1)!;
    expect(call.init?.method).toBe("POST");
    expect((call.init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("lists waiting sign-ups and approves with a role and an end date", async () => {
    server({
      "/v0/auth/password": () => reply(200, signedIn),
      "/v0/me": () => reply(200, me),
      "/v0/staff/signups": () =>
        reply(200, {
          signups: [
            {
              id: "a1",
              email: "sam@example.test",
              display_name: "Sam Q",
              created_at: "2026-10-20T10:00:00Z",
              expires_at: "2026-11-19T10:00:00Z",
            },
          ],
        }),
      "/v0/staff/signups/a1/approve": () =>
        reply(201, { staff_id: "s9", role: "paraprofessional" }),
      "/v0/staff/signups/a1/reject": () => reply(204),
    });
    await signIn("d@example.test", "pw");
    const l = await listSignups();
    expect(l).toMatchObject({ ok: true, value: [{ id: "a1", displayName: "Sam Q" }] });
    expect(await approveSignup("a1", "paraprofessional", "2027-06-30")).toEqual({
      ok: true,
      value: { role: "paraprofessional" },
    });
    expect(JSON.parse(String(calls.at(-1)!.init?.body))).toEqual({
      role: "paraprofessional",
      endsOn: "2027-06-30",
    });
    expect(await rejectSignup("a1")).toEqual({ ok: true, value: true });
  });

  it("says plainly when the person is not the director, or the sign-up is gone", async () => {
    server({
      "/v0/staff/signups": () => reply(403),
      "/v0/staff/signups/x/approve": () => reply(404),
    });
    expect(await listSignups()).toEqual({ ok: false, message: "Only the director can do this." });
    const r = await approveSignup("x", "case_manager", "2027-06-30");
    expect(r).toMatchObject({ ok: false });
    expect((r as { message: string }).message).toContain("gone");
  });

  it("approve answers 409 when the email was given to someone else meanwhile, and returns the role", async () => {
    server({ "/v0/staff/signups/z/approve": () => reply(409) });
    const r = await approveSignup("z", "case_manager", "2027-06-30");
    expect((r as { message: string }).message).toBe(
      "Someone already has this email. Reject this sign-up or check Staff.",
    );
    server({
      "/v0/staff/signups/y/approve": () => reply(201, { staff_id: "s1", role: "gen_ed_teacher" }),
    });
    expect(await approveSignup("y", "gen_ed_teacher", "2027-06-30")).toEqual({
      ok: true,
      value: { role: "gen_ed_teacher" },
    });
  });

  it("invite 409 still means too many open codes", async () => {
    server({ "/v0/auth/invites": () => reply(409) });
    const r = await createInvite();
    expect((r as { message: string }).message).toContain("too many open invite codes");
  });

  it("uses the invite-code and busy lines for sign-up", async () => {
    expect(errorMessage("signup", 401, null)).toBe(
      "That invite code didn't work. Ask your director for a new one.",
    );
    expect(errorMessage("signup", 503, null)).toBe(
      "Sign-up is busy right now. Try again in a few minutes.",
    );
  });

  it("defaults the access end date to the end of the school year", () => {
    expect(defaultEndsOn(new Date(2026, 9, 21))).toBe("2027-06-30");
    expect(defaultEndsOn(new Date(2027, 2, 1))).toBe("2027-06-30");
  });

  it("offers every approvable role and never the director", () => {
    const html = renderToString(
      createElement(PendingList, {
        people: [{ id: "p1", displayName: "Sam Q", email: "s@example.test", requestedAt: "" }],
        actions: { approve: async () => null, reject: async () => null },
        onChanged: () => {},
      }),
    );
    expect(html).toContain("Building coordinator");
    expect(html).not.toContain("SPED director");
    expect(html).toContain('type="date"');
  });
});

describe("the built-in fetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("puts the server address in front of the path and sends the cookie", async () => {
    const seen: { url: string; init: RequestInit | undefined }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      seen.push({ url, init });
      return new Response("{}");
    });
    await serverFetch("https://api.example.test")("/v0/me", { method: "GET" });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("https://api.example.test/v0/me");
    expect(seen[0]?.init?.credentials).toBe("include");
    expect(seen[0]?.init?.method).toBe("GET");
  });
});

describe("second factor", () => {
  const body = (path: string) =>
    JSON.parse(String(calls.find((c) => c.path === path)?.init?.body ?? "{}")) as Record<
      string,
      unknown
    >;

  it("password answers hand back a challenge to keep in memory, with no token", async () => {
    server({ "/v0/auth/password": () => reply(200, { status: "second_factor", challenge: "c1" }) });
    expect(await signIn("a@example.test", "pw")).toEqual({
      kind: "second_factor",
      challenge: "c1",
    });
    server({
      "/v0/auth/password": () => reply(200, { status: "enrol_second_factor", challenge: "c2" }),
    });
    expect(await signIn("a@example.test", "pw")).toEqual({ kind: "enrol", challenge: "c2" });
    expect(hasToken()).toBe(false);
  });

  it("a person with no authenticator yet is told to ask the director for a reset code", async () => {
    server({
      "/v0/auth/password": () => reply(403, { status: "second_factor_setup_needed" }),
    });
    const out = await signIn("a@example.test", "pw");
    expect(out).toMatchObject({ kind: "error" });
    expect(out.kind === "error" && out.message).toMatch(/reset code to set up your authenticator/);
    expect(hasToken()).toBe(false);
  });

  it("long waits after too many wrong codes are given in hours", () => {
    expect(waitMessage("3600")).toBe(
      "Too many tries. Wait 1 hour and try again. Ask your director for a reset code to sign in sooner.",
    );
    expect(waitMessage("86400")).toContain("Wait 24 hours");
    expect(waitMessage("3000")).toBe("Too many tries. Wait 50 minutes and try again.");
  });

  it("a challenge answer without a challenge string cannot finish", async () => {
    server({ "/v0/auth/password": () => reply(200, { status: "second_factor" }) });
    expect(await signIn("a@example.test", "pw")).toMatchObject({ kind: "error" });
  });

  it("signs in with a code or a recovery code, never both, and reports codes left", async () => {
    server({
      "/v0/auth/second-factor": () => reply(200, { ...signedIn, recovery_codes_left: 2 }),
      "/v0/me": () => reply(200, me),
    });
    const out = await secondFactor("c1", { code: "123456" });
    expect(out).toMatchObject({ kind: "signed_in", recoveryLeft: 2 });
    const sent = body("/v0/auth/second-factor");
    expect(sent).toMatchObject({ challenge: "c1", code: "123456", deviceId: deviceId() });
    expect(sent).not.toHaveProperty("recoveryCode");
    await secondFactor("c1", { recoveryCode: "ABCD-EFGH-JKLM-NPQR" });
    const last = JSON.parse(
      String(calls.filter((c) => c.path === "/v0/auth/second-factor")[1]?.init?.body),
    );
    expect(last).toMatchObject({ recoveryCode: "ABCD-EFGH-JKLM-NPQR" });
    expect(last).not.toHaveProperty("code");
    expect(calls[0]?.init?.headers).toMatchObject({ "X-GoalLine-Client": "web" });
  });

  it("says one thing for a wrong code, waits on 429 and names the device limit on 409", async () => {
    server({ "/v0/auth/second-factor": () => reply(401) });
    expect(await secondFactor("c", { code: "000000" })).toMatchObject({
      message: "That code didn't work. Check the time on your phone, or use a recovery code.",
    });
    server({ "/v0/auth/second-factor": () => reply(429, undefined, { "Retry-After": "120" }) });
    expect(await secondFactor("c", { code: "000000" })).toMatchObject({
      message: "Too many tries. Wait 2 minutes and try again.",
    });
    server({ "/v0/auth/second-factor": () => reply(409) });
    expect(await secondFactor("c", { code: "000000" })).toMatchObject({
      message: expect.stringContaining("two other devices") as string,
    });
    expect(hasToken()).toBe(false);
  });

  it("enrol: returns the key and link, the same challenge each time, and 401 means start over", async () => {
    server({
      "/v0/auth/second-factor/enrol": () =>
        reply(200, {
          otpauth_uri: "otpauth://totp/GoalLine:a?secret=ABCDEFGHJKLMNPQR",
          secret: "ABCDEFGHJKLMNPQR",
        }),
    });
    expect(await enrolStart("c2")).toEqual({
      kind: "key",
      otpauthUri: "otpauth://totp/GoalLine:a?secret=ABCDEFGHJKLMNPQR",
      secret: "ABCDEFGHJKLMNPQR",
    });
    expect(body("/v0/auth/second-factor/enrol")).toEqual({ challenge: "c2", deviceId: deviceId() });
    server({ "/v0/auth/second-factor/enrol": () => reply(401) });
    expect(await enrolStart("c2")).toEqual({ kind: "expired" });
    server({ "/v0/auth/second-factor/enrol": () => reply(200, { secret: 5 }) });
    expect(await enrolStart("c2")).toMatchObject({ kind: "error" });
  });

  it("enrol confirm returns the recovery codes once and signs in", async () => {
    const codes = Array.from({ length: 10 }, (_, i) => `CODE-000${i}`);
    server({
      "/v0/auth/second-factor/enrol/confirm": () =>
        reply(200, { ...signedIn, recovery_codes: codes }),
      "/v0/me": () => reply(200, me),
    });
    const out = await enrolConfirm("c2", "123456");
    expect(out).toMatchObject({ kind: "codes", after: null });
    expect(out.kind === "codes" && out.codes).toEqual(codes);
    expect(out.kind === "codes" && out.me?.role).toBe("case_manager");
    expect(body("/v0/auth/second-factor/enrol/confirm")).toMatchObject({
      challenge: "c2",
      code: "123456",
    });
  });

  it("enrol confirm 409 still shows the codes, then the device-limit line, with no session", async () => {
    server({
      "/v0/auth/second-factor/enrol/confirm": () => reply(409, { recovery_codes: ["AAAA-BBBB"] }),
    });
    const out = await enrolConfirm("c2", "123456");
    expect(out).toMatchObject({ kind: "codes", codes: ["AAAA-BBBB"], me: null });
    expect(out.kind === "codes" && out.after).toContain("two other devices");
    expect(hasToken()).toBe(false);
  });

  it("enrol confirm: a wrong code is an error with no codes; a 200 without codes cannot finish", async () => {
    server({ "/v0/auth/second-factor/enrol/confirm": () => reply(401) });
    expect(await enrolConfirm("c2", "000000")).toMatchObject({ kind: "error" });
    server({ "/v0/auth/second-factor/enrol/confirm": () => reply(200, signedIn) });
    expect(await enrolConfirm("c2", "123456")).toMatchObject({ kind: "error" });
  });

  it("never writes a challenge, code or recovery code to browser storage", () => {
    const src = readFileSync(new URL("../src/auth/AuthPanel.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
    // The setup key is never put on the clipboard.
    expect(src).not.toMatch(/clipboard|Copy setup key/i);
  });

  it("groups the setup key in fours", () => {
    expect(groupKey("ABCDEFGHJKLMNPQR")).toBe("ABCD EFGH JKLM NPQR");
    expect(groupKey("abcd efgh ij")).toBe("abcd efgh ij");
  });
});

describe("the scheduled refresh", () => {
  const T0 = Date.parse("2030-06-01T12:00:00Z");
  const ends = (ms: number) => new Date(T0 + ms).toISOString();
  const fresh = (ms: number) => ({ ...signedIn, access_expires_at: ends(ms) });
  const person = {
    id: "u1",
    displayName: "Pat Case",
    email: "pat@example.test",
    role: "case_manager" as const,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    onSignOut(null);
    setRole(null);
    vi.useRealTimers();
  });

  async function start(refreshAnswer: () => Response) {
    let answer = () => reply(200, fresh(600_000));
    server({ "/v0/auth/web/refresh": () => answer() });
    expect(await refresh()).toBe("ok");
    begin(person);
    answer = refreshAnswer;
    return (next: () => Response) => (answer = next);
  }

  it("keeps the person signed in through a brief network failure", async () => {
    const set = await start(() => {
      throw new Error("offline");
    });
    await vi.advanceTimersByTimeAsync(540_000); // the refresh fires a minute before the end
    expect(currentPerson()).not.toBeNull();
    await vi.advanceTimersByTimeAsync(15_000); // a retry still cannot reach the server
    expect(currentPerson()).not.toBeNull();
    set(() => reply(200, fresh(1_200_000)));
    await vi.advanceTimersByTimeAsync(15_000); // the next retry works
    expect(currentPerson()).not.toBeNull();
    expect(hasToken()).toBe(true);
  });

  it("keeps trying on a server error until the token itself runs out, then signs out", async () => {
    await start(() => reply(500));
    await vi.advanceTimersByTimeAsync(540_000);
    expect(currentPerson()).not.toBeNull();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(currentPerson()).not.toBeNull();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(currentPerson()).toBeNull();
    expect(hasToken()).toBe(false);
  });

  it("signs out at once when the server says the session is over", async () => {
    await start(() => reply(401));
    await vi.advanceTimersByTimeAsync(540_000);
    expect(currentPerson()).toBeNull();
    expect(hasToken()).toBe(false);
  });

  it("refuses an end time it cannot read, so the timer cannot loop", async () => {
    server({
      "/v0/auth/web/refresh": () => reply(200, { ...signedIn, access_expires_at: "soon" }),
    });
    expect(await refresh()).toBe("no_server");
    expect(hasToken()).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
