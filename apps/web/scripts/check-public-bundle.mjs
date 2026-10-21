#!/usr/bin/env node
// The public practice build must carry no sign-in server code. Run after `vite build` without
// VITE_GOALLINE_API_ORIGIN. Fails if any trace of the server routes or cookie/token handling is found.
import { readFileSync, readdirSync } from "node:fs";

const dist = new URL("../dist/", import.meta.url);
const banned = [
  "/v0/",
  "X-GoalLine-Client",
  "refresh_token",
  "Set-Cookie",
  "goalline-refresh",
  "goalline.deviceId",
  "access_token",
];
const problems = [];
for (const f of readdirSync(new URL("assets/", dist))) {
  if (!/\.(js|css|html)$/.test(f)) continue;
  const text = readFileSync(new URL(`assets/${f}`, dist), "utf8");
  for (const b of banned) if (text.includes(b)) problems.push(`"${b}" in assets/${f}`);
  if (/AuthPanel/.test(f)) problems.push(`sign-in chunk assets/${f}`);
}
const html = readFileSync(new URL("index.html", dist), "utf8");
for (const b of banned) if (html.includes(b)) problems.push(`"${b}" in index.html`);
if (problems.length > 0) {
  for (const p of problems) console.error(`Public bundle check: ${p}`);
  process.exit(1);
}
console.log("Public bundle check passed");
