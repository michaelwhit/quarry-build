#!/usr/bin/env node
// Fails if any tracked text file contains something that looks like a real person's identifier.
// This is a tripwire, not a guarantee: every fixture must come from packages/synthetic-data, whose
// ids carry the SYN- prefix and whose emails use reserved .example / .test domains.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SKIP = [
  /^pnpm-lock\.yaml$/,
  /\.(png|jpe?g|gif|pdf|ico|icns|car|ttf|otf|woff2?)$/i,
  /^tools\/scan-fixtures\.mjs$/,
];
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
// Pinned action hashes can contain runs of digits that look like ids. Only `uses:` lines are exempt.
const PINNED_USES = /^(\s*(?:-\s+)?uses:\s*[\w./-]+@)[0-9a-f]{40}\b/;
const ALLOWED_EMAIL_DOMAIN =
  /@(?:[a-z0-9-]+\.)*(?:example|test|invalid|localhost)$|@example\.(?:com|org|net)$|@noreply\.anthropic\.com$|@users\.noreply\.github\.com$/i;

const checks = [
  { name: "SSN-shaped number", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  // State NDE student ids are 10 digits.
  { name: "10-digit id (NDE student id shape)", re: /(?<![\d.])\d{10}(?![\d.])/g },
  { name: "US phone number", re: /\(?\b\d{3}\)?[-. ]\d{3}[-.]\d{4}\b/g },
  {
    name: "email outside reserved test domains",
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    allow: (m) => ALLOWED_EMAIL_DOMAIN.test(m),
  },
];

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
const findings = [];
for (const file of files) {
  if (SKIP.some((re) => re.test(file))) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\u0000")) continue; // binary
  text.split("\n").forEach((rawLine, i) => {
    const line = rawLine.replace(UUID, "<uuid>").replace(PINNED_USES, "$1<sha>");
    for (const c of checks) {
      for (const m of line.matchAll(c.re)) {
        if (c.allow?.(m[0])) continue;
        findings.push(`${file}:${i + 1}: ${c.name}: ${m[0]}`);
      }
    }
  });
}

if (findings.length > 0) {
  console.error("Possible real-looking identifiers (use packages/synthetic-data instead):");
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`fixture scan ok: ${files.length} tracked files checked`);
