import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Runs the jq program that the "Approval on head" workflow uses to read the review verdict.
const workflow = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../.github/workflows/approval-on-head.yml"),
  "utf8",
);
const filter = workflow.match(
  /# verdict-filter-begin\n\s*review_filter='\n([\s\S]*?)\n\s*'\n\s*# verdict-filter-end/,
)?.[1];
assert.ok(filter, "verdict filter not found in the workflow");

const SHA = "a".repeat(40);
const PATH = ".github/workflows/claude-review.yml";

const run = (over) => ({
  id: 1,
  head_sha: SHA,
  event: "pull_request",
  path: PATH,
  status: "completed",
  conclusion: "success",
  ...over,
});

function verdict(runs, sha = SHA) {
  return execFileSync("jq", ["-r", "--arg", "s", sha, "--arg", "p", PATH, filter], {
    input: JSON.stringify({ workflow_runs: runs }),
  })
    .toString()
    .trim();
}

test("success is pass, failure is block", () => {
  assert.equal(verdict([run({})]), "pass");
  assert.equal(verdict([run({ conclusion: "failure" })]), "block");
});

test("cancelled, skipped, timed out and unfinished runs give no verdict", () => {
  for (const conclusion of ["cancelled", "skipped", "timed_out", "neutral", null]) {
    assert.equal(verdict([run({ conclusion })]), "none", String(conclusion));
  }
  assert.equal(verdict([run({ status: "in_progress", conclusion: null })]), "none");
});

test("no runs give no verdict", () => {
  assert.equal(verdict([]), "none");
});

test("a run for a different head does not count", () => {
  assert.equal(verdict([run({ head_sha: "b".repeat(40) })]), "none");
});

test("a run of a different workflow file does not count", () => {
  assert.equal(verdict([run({ path: ".github/workflows/other.yml" })]), "none");
});

test("a run from another event does not count", () => {
  assert.equal(verdict([run({ event: "issue_comment" })]), "none");
});

test("the newest run for the head decides, in either direction", () => {
  assert.equal(verdict([run({ id: 1, conclusion: "failure" }), run({ id: 2 })]), "pass");
  assert.equal(verdict([run({ id: 1 }), run({ id: 2, conclusion: "failure" })]), "block");
  assert.equal(verdict([run({ id: 1 }), run({ id: 2, conclusion: "cancelled" })]), "none");
});

test("a ref suffix on the path is ignored", () => {
  assert.equal(verdict([run({ path: `${PATH}@refs/pull/1/merge` })]), "pass");
});
