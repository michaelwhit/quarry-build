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
const trustedFilter = workflow.match(
  /# verdict-filter-trusted-begin\n\s*trusted_filter='\n([\s\S]*?)\n\s*'\n\s*# verdict-filter-trusted-end/,
)?.[1];
assert.ok(trustedFilter, "trusted verdict filter not found in the workflow");

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

// The trusted review: a workflow_run run of claude-review-trusted.yml named "Review <pull request number> <head sha>".
const TRUSTED = ".github/workflows/claude-review-trusted.yml";
const PR_NUMBER = "7";
const trustedRun = (over) => ({
  id: 1,
  head_sha: "f".repeat(40), // the default branch's sha, never the pull request head
  display_title: `Review ${PR_NUMBER} ${SHA}`,
  event: "workflow_run",
  path: TRUSTED,
  status: "completed",
  conclusion: "success",
  ...over,
});

function trusted(runs, sha = SHA, number = PR_NUMBER) {
  return execFileSync(
    "jq",
    ["-r", "--arg", "n", number, "--arg", "s", sha, "--arg", "p", TRUSTED, trustedFilter],
    {
      input: JSON.stringify({ workflow_runs: runs }),
    },
  )
    .toString()
    .trim();
}

test("trusted: success is pass, failure is block", () => {
  assert.equal(trusted([trustedRun({})]), "pass");
  assert.equal(trusted([trustedRun({ conclusion: "failure" })]), "block");
});

test("trusted: unfinished, cancelled or missing runs give no verdict", () => {
  for (const conclusion of ["cancelled", "skipped", "timed_out", "neutral", null]) {
    assert.equal(trusted([trustedRun({ conclusion })]), "none", String(conclusion));
  }
  assert.equal(trusted([trustedRun({ status: "in_progress", conclusion: null })]), "none");
  assert.equal(trusted([]), "none");
});

test("trusted: a run named for another head does not count, so a new push starts again", () => {
  assert.equal(
    trusted([trustedRun({ display_title: `Review ${PR_NUMBER} ${"b".repeat(40)}` })]),
    "none",
  );
  assert.equal(trusted([trustedRun({})], "c".repeat(40)), "none");
});

test("trusted: a run from a pull_request event never counts, even with the right name", () => {
  assert.equal(trusted([trustedRun({ event: "pull_request" })]), "none");
  assert.equal(trusted([trustedRun({ event: "push" })]), "none");
});

test("trusted: a run of any other file never counts, even with the right name", () => {
  assert.equal(trusted([trustedRun({ path: ".github/workflows/claude-review.yml" })]), "none");
  assert.equal(trusted([trustedRun({ path: ".github/workflows/evil.yml" })]), "none");
});

test("trusted: a title that only starts with the sha does not count", () => {
  assert.equal(
    trusted([trustedRun({ display_title: `Review ${PR_NUMBER} ${SHA} extra` })]),
    "none",
  );
  assert.equal(trusted([trustedRun({ display_title: `review ${PR_NUMBER} ${SHA}` })]), "none");
});

test("trusted: the newest run for the head decides, in either direction", () => {
  assert.equal(
    trusted([trustedRun({ id: 1, conclusion: "failure" }), trustedRun({ id: 2 })]),
    "pass",
  );
  assert.equal(
    trusted([trustedRun({ id: 1 }), trustedRun({ id: 2, conclusion: "failure" })]),
    "block",
  );
});

test("trusted: a ref suffix on the path is ignored", () => {
  assert.equal(trusted([trustedRun({ path: `${TRUSTED}@refs/heads/main` })]), "pass");
});

test("trusted: a review named for another pull request number does not count", () => {
  assert.equal(trusted([trustedRun({ display_title: `Review 8 ${SHA}` })]), "none");
  assert.equal(trusted([trustedRun({ display_title: `Review ${SHA}` })]), "none");
  assert.equal(trusted([trustedRun({ display_title: `Review 77 ${SHA}` })]), "none");
  assert.equal(trusted([trustedRun({ display_title: `Review 7 ${SHA}` })], SHA, "70"), "none");
});

test("trusted: a newer review for another pull request does not hide this one's", () => {
  const other = trustedRun({ id: 2, display_title: `Review 8 ${SHA}`, conclusion: "failure" });
  assert.equal(trusted([trustedRun({ id: 1 }), other]), "pass");
});

// The job guard and run name are plain text in the workflow; these checks keep the two pull request
// rules from being edited away unnoticed.
const trustedWorkflow = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../.github/workflows/claude-review-trusted.yml",
  ),
  "utf8",
);

test("trusted workflow: the job is skipped when two pull requests share the head", () => {
  assert.match(trustedWorkflow, /github\.event\.workflow_run\.pull_requests\[1\] == null/);
});

test("trusted workflow: the job runs only for a pull request aimed at the default branch", () => {
  assert.match(
    trustedWorkflow,
    /github\.event\.workflow_run\.pull_requests\[0\]\.base\.ref == github\.event\.repository\.default_branch/,
  );
});

test("trusted workflow: the run name carries the pull request number and the head sha", () => {
  assert.match(
    trustedWorkflow,
    /^run-name: Review \$\{\{ github\.event\.workflow_run\.pull_requests\[0\]\.number \}\} \$\{\{ github\.event\.workflow_run\.head_sha \}\}$/m,
  );
});

test("approval workflow: a pull request not aimed at the default branch is never approved", () => {
  assert.match(workflow, /\[ "\$base_ref" != "\$default_branch" \]/);
  assert.match(workflow, /Base is not the default branch: not evaluated/);
});

test("approval workflow: the trusted review is recognised by its file, not by its run name", () => {
  assert.match(
    workflow,
    /startsWith\(github\.event\.workflow_run\.path, '\.github\/workflows\/claude-review-trusted\.yml'\)/,
  );
  assert.doesNotMatch(workflow, /workflow_run\.name == 'Claude PR review \(trusted\)'/);
});

test("approval workflow: a protected path needs the security line on the full head sha, and the review PASS", () => {
  assert.match(workflow, /Security review by Sable, relayed by Clawson, Verdict: approved on/);
  assert.match(
    workflow,
    /\[ "\$verdict" = "pass" \] && \{ \[ "\$needs_sec" = "false" \] \|\| \[ "\$sec_ok" = "true" \]; \}/,
  );
  assert.doesNotMatch(workflow, /lead_ok/);
});
