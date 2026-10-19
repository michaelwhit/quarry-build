#!/usr/bin/env node
// CSP gate for CI: the built page must have no inline scripts, no inline event handlers, no
// external script/style/font origins, and must carry the strict policy that serve.mjs sends.
import { readFileSync, readdirSync } from "node:fs";
import { CSP } from "./csp.mjs";

const dist = new URL("../dist/", import.meta.url);
const html = readFileSync(new URL("index.html", dist), "utf8");
const problems = [];

for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (!/\bsrc=/.test(m[1] ?? "") || (m[2] ?? "").trim() !== "")
    problems.push("inline <script> in index.html");
}
if (/\son[a-z]+\s*=/i.test(html)) problems.push("inline event handler attribute in index.html");
if (/<style\b/i.test(html) || /\sstyle\s*=/i.test(html))
  problems.push("inline style in index.html");
if (/(?:src|href)\s*=\s*["']https?:\/\//i.test(html))
  problems.push("external resource in index.html");
if (!html.includes("Content-Security-Policy")) problems.push("missing CSP meta fallback");
if (!CSP.includes("frame-ancestors 'none'") || /unsafe-/.test(CSP))
  problems.push("CSP is too loose");

// Meta policies cannot carry frame-ancestors, so the meta must match the header policy without it.
const meta = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/)?.[1];
const expectedMeta = CSP.replace(/;\s*frame-ancestors[^;]*/, "");
if (meta !== expectedMeta) problems.push("CSP meta differs from the header policy");

for (const f of readdirSync(new URL("assets/", dist))) {
  if (!f.endsWith(".js")) continue;
  const js = readFileSync(new URL(`assets/${f}`, dist), "utf8");
  if (/\beval\s*\(|new Function\s*\(/.test(js.replace(/\/\*[\s\S]*?\*\//g, "")))
    problems.push(`eval/new Function in assets/${f}`);
  if (
    /https?:\/\/(?!www\.w3\.org|react\.dev|reactjs\.org|github\.com\/facebook)[a-z0-9.-]+\//i.test(
      js.match(/fetch\([^)]*\)/g)?.join(" ") ?? "",
    )
  )
    problems.push(`fetch to an external origin in assets/${f}`);
}

if (problems.length > 0) {
  for (const p of problems) console.error(`CSP check: ${p}`);
  process.exit(1);
}
console.log("CSP check passed");
