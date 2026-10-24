// Ties the sign-in server to the role the rest of the app reads. Loaded only in a build made with a sign-in server address.
import { clearPracticeStorage } from "../data/practiceStorage.ts";
import { onSignOut, setRole } from "../data/roles.ts";
import { forgetToken, getMe, refresh, signOut, tokenExpiresAt } from "./client.ts";
import type { Me } from "./client.ts";

let timer: ReturnType<typeof setTimeout> | undefined;
let who: Me | null = null;
export const currentPerson = () => who;

function stopTimer() {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
}

/** How long to wait before trying again when the server cannot be reached. */
const RETRY_MS = 15_000;

/**
 * Refresh a minute before the access token ends. Only the server saying the session is over
 * (401) signs the person out. When the server cannot be reached the refresh is tried again
 * until the token itself runs out.
 */
function schedule(wait = Math.max(5_000, tokenExpiresAt() - Date.now() - 60_000)) {
  stopTimer();
  timer = setTimeout(() => {
    void refresh().then((r) => {
      if (r === "ok") schedule();
      else if (r === "signed_out" || Date.now() >= tokenExpiresAt()) endLocal();
      else schedule(RETRY_MS);
    });
  }, wait);
}

function endLocal() {
  stopTimer();
  forgetToken();
  who = null;
  setRole(null);
}

// A flag, never content: set while a sign-out has not been confirmed by the server, so a reload
// cannot quietly sign the person back in with a refresh cookie that is still valid.
const PENDING_SIGNOUT = "goalline-signout-pending";
function setPending(): boolean {
  try {
    window.localStorage.setItem(PENDING_SIGNOUT, "1");
    return true;
  } catch {
    return false;
  }
}
function signOutPending(): boolean {
  try {
    return window.localStorage.getItem(PENDING_SIGNOUT) !== null;
  } catch {
    return false;
  }
}
function clearPending() {
  try {
    window.localStorage.removeItem(PENDING_SIGNOUT);
  } catch {
    // Nothing to clear.
  }
}

// Set when a sign-out could neither be confirmed nor recorded as a flag, so the page was not
// reloaded. Until it is, the screen that checks for a session does not refresh, and the next
// sign-in reloads first so nothing from the last person is still in memory.
let reloadBeforeNextSignIn = false;

export function begin(me: Me) {
  if (reloadBeforeNextSignIn) {
    // The new session's cookie is already set, so the reload signs this person straight in.
    window.location.reload();
    return;
  }
  who = me;
  // A new sign-in replaces the old cookie, so an old unconfirmed sign-out no longer applies.
  clearPending();
  // Every way out of a session (the button, an expired session, a failed refresh) ends in
  // setRole(null), which runs this. Clear first, then reload so no module's copy comes back.
  onSignOut(() => {
    stopTimer();
    who = null;
    clearPracticeStorage();
    const marked = setPending();
    // Held from the start, so nothing signs back in while the logout is still unconfirmed.
    if (!marked && typeof window !== "undefined") reloadBeforeNextSignIn = true;
    void Promise.race([
      signOut(),
      new Promise<boolean>((r) => setTimeout(() => r(false), 2000)),
    ]).then((confirmed) => {
      if (confirmed) clearPending();
      // Modules still hold copies during the wait, so a late save could have put text back.
      clearPracticeStorage();
      if (confirmed || marked) window.location.reload();
    });
  });
  setRole(me.role);
  schedule();
}

/** On page load there is no access token in memory: refresh first. */
export async function restore(): Promise<"signed_in" | "signed_out" | "no_server"> {
  // A sign-out the server never confirmed: finish it first, and do not refresh until it is done.
  if (signOutPending() || reloadBeforeNextSignIn) {
    if (await signOut()) clearPending();
    return "signed_out";
  }
  const r = await refresh();
  if (r !== "ok") return r;
  const me = await getMe();
  if (!me) return "signed_out";
  begin(me);
  return "signed_in";
}
