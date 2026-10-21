// What the person reads for each server answer. The server's own text is never shown.

export const PROBLEM_LINES: Record<string, string> = {
  too_short: "Use at least 14 characters.",
  too_long: "Use 128 characters or fewer.",
  common: "That password is too common or has appeared in a data breach. Pick another.",
  contains_personal: "Don't use your name, your email, or the app's name in your password.",
};

export const GENERIC = "Something went wrong. Reload the page and try again.";
export const CANT_FINISH = "This version of GoalLine can't finish signing in. Reload the page.";
export const NO_SERVER = "Can't reach the GoalLine server. Check your connection and try again.";

/** "Too many tries. Wait 3 minutes and try again." Seconds round up to whole minutes. */
export function waitMessage(retryAfter: string | null): string {
  const secs = Number(retryAfter);
  if (!Number.isFinite(secs) || secs <= 0)
    return "Too many tries. Wait a few minutes and try again.";
  const mins = Math.ceil(secs / 60);
  if (mins >= 60) {
    const hours = Math.ceil(secs / 3600);
    return `Too many tries. Wait ${hours} ${hours === 1 ? "hour" : "hours"} and try again. Ask your director for a reset code to sign in sooner.`;
  }
  if (mins <= 1) return "Too many tries. Wait a minute and try again.";
  return `Too many tries. Wait ${mins} minutes and try again.`;
}

export const SETUP_NEEDED = "Ask your director for a reset code to set up your authenticator app.";

/** The line shown after a recovery code is used: how many are left, and what to do at none. */
export function recoveryLeftMessage(left: number): string {
  if (left <= 0)
    return "You have no recovery codes left. Ask your director for a reset code before you need one.";
  return `You have ${left} recovery ${left === 1 ? "code" : "codes"} left.`;
}

export type Route =
  "password" | "set-password" | "signup" | "signup-school" | "second-factor" | "enrol";

export const NO_SCHOOLS =
  "No schools found. Check the spelling, or ask your director for an invite code.";

export const DEVICE_LIMIT =
  "You're signed in on two other devices. Sign out on one of them, then try again.";
export const START_OVER = "That sign-in step has ended. Start again from your password.";

/** The line for a non-success status. `retryAfter` is the Retry-After header value. */
export function errorMessage(route: Route, status: number, retryAfter: string | null): string {
  if (status === 429) return waitMessage(retryAfter);
  if (status === 401) {
    if (route === "second-factor")
      return "That code didn't work. Check the time on your phone, or use a recovery code.";
    if (route === "enrol")
      return "That code didn't work. Check the time on your phone and try the next code.";
    if (route === "password")
      return "That email and password don't match an account that can sign in.";
    if (route === "set-password")
      return "That code didn't work. It may have expired or been used. Ask your director for a new one.";
    if (route === "signup-school")
      return "That school isn't taking sign-ups. Ask your director for an invite code.";
    return "That invite code didn't work. Ask your director for a new one.";
  }
  if (status === 409 && (route === "password" || route === "second-factor" || route === "enrol"))
    return DEVICE_LIMIT;
  if (status === 503 && (route === "signup" || route === "signup-school"))
    return "Sign-up is busy right now. Try again in a few minutes.";
  if (status === 404) return "Sign-up and sign-in aren't available here yet.";
  return GENERIC;
}

/** One line per rule the server named; unknown rules are ignored. */
export function problemLines(problems: unknown): string[] {
  if (!Array.isArray(problems)) return [];
  return problems.flatMap((p) =>
    typeof p === "string" && PROBLEM_LINES[p] ? [PROBLEM_LINES[p]] : [],
  );
}
