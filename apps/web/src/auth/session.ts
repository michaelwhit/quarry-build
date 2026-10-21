// Ties the sign-in server to the role the rest of the app reads. Loaded only in a build made with a sign-in server address.
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

/** Refresh a minute before the access token ends; a failed refresh signs the person out. */
function schedule() {
  stopTimer();
  const wait = Math.max(5_000, tokenExpiresAt() - Date.now() - 60_000);
  timer = setTimeout(() => {
    void refresh().then((r) => {
      if (r === "ok") schedule();
      else endLocal();
    });
  }, wait);
}

function endLocal() {
  stopTimer();
  forgetToken();
  who = null;
  setRole(null);
}

export function begin(me: Me) {
  who = me;
  onSignOut(() => {
    stopTimer();
    who = null;
    void signOut();
  });
  setRole(me.role);
  schedule();
}

/** On page load there is no access token in memory: refresh first. */
export async function restore(): Promise<"signed_in" | "signed_out" | "no_server"> {
  const r = await refresh();
  if (r !== "ok") return r;
  const me = await getMe();
  if (!me) return "signed_out";
  begin(me);
  return "signed_in";
}
