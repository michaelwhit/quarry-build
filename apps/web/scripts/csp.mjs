// The one Content-Security-Policy the app is built for. serve.mjs sends it; the CSP gate checks it.
// The only way to loosen it is the build setting VITE_GOALLINE_API_ORIGIN: that one origin is added
// to connect-src, and nothing else changes.

/**
 * The API origin from the build setting, or "" when it is unset. Throws on anything that is not a
 * bare origin: https only (plain http only for a local test host), no user info, path, query or hash.
 */
export function apiOrigin(raw) {
  const text = (raw ?? "").trim();
  if (text === "") return "";
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error("VITE_GOALLINE_API_ORIGIN is not a valid URL");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
    throw new Error("VITE_GOALLINE_API_ORIGIN must be an https origin");
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/")
    throw new Error("VITE_GOALLINE_API_ORIGIN must be an origin only: no path, query or user info");
  if (text.includes("*")) throw new Error("VITE_GOALLINE_API_ORIGIN must not contain a wildcard");
  return url.origin;
}

/** The full policy for a build with the given API origin ("" for the practice build). */
export function cspFor(origin = "") {
  const connect = origin === "" ? "'self'" : `'self' ${origin}`;
  return (
    `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src ${connect}; ` +
    "manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  );
}

/** A meta policy cannot carry frame-ancestors, so the page's copy leaves it out. */
export const metaFor = (origin = "") => cspFor(origin).replace(/;\s*frame-ancestors[^;]*/, "");

export const CSP = cspFor("");
