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
  if (mins <= 1) return "Too many tries. Wait a minute and try again.";
  return `Too many tries. Wait ${mins} minutes and try again.`;
}

export type Route = "password" | "set-password" | "signup";

/** The line for a non-success status. `retryAfter` is the Retry-After header value. */
export function errorMessage(route: Route, status: number, retryAfter: string | null): string {
  if (status === 429) return waitMessage(retryAfter);
  if (status === 401) {
    if (route === "password")
      return "That email and password don't match an account that can sign in.";
    if (route === "set-password")
      return "That code didn't work. It may have expired or been used. Ask your director for a new one.";
    return "That invite code didn't work. Ask your director for a new one.";
  }
  if (status === 409 && route === "password")
    return "You're signed in on two other devices. Sign out on one of them, then try again.";
  if (status === 503 && route === "signup")
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
