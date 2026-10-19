import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "apple-scope.sh");

// Builds a repo whose HEAD is a commit on top of a base commit, like a pull request merge commit.
function scope(event, base, change) {
  const dir = mkdtempSync(join(tmpdir(), "scope-"));
  const git = (...args) =>
    execFileSync("git", ["-C", dir, "-c", "user.email=t@t", "-c", "user.name=t", ...args], {
      stdio: "pipe",
    });
  git("init", "-q");
  for (const f of base) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), "x");
  }
  git("add", "-A");
  git("commit", "-qm", "base");
  change(dir);
  git("add", "-A");
  git("commit", "-qm", "change");
  return execFileSync("bash", [script, event], { cwd: dir, encoding: "utf8" }).trim();
}
const add = (f) => (dir) => {
  mkdirSync(dirname(join(dir, f)), { recursive: true });
  writeFileSync(join(dir, f), "y");
};

test("docs-only pull request skips the Apple build", () => {
  assert.equal(scope("pull_request", ["README.md"], add("docs/a.md")), "apple=false");
});
test("a change under apps/apple builds", () => {
  assert.equal(scope("pull_request", ["README.md"], add("apps/apple/A.swift")), "apple=true");
});
test("push events always build", () => {
  assert.equal(scope("push", ["README.md"], add("docs/a.md")), "apple=true");
});
test("a file moved out of apps/apple builds (both sides listed)", () => {
  const run = scope("pull_request", ["apps/apple/Foo.swift"], (dir) => {
    mkdirSync(join(dir, "docs"), { recursive: true });
    renameSync(join(dir, "apps/apple/Foo.swift"), join(dir, "docs/Foo.swift"));
  });
  assert.equal(run, "apple=true");
});
test("a non-ASCII name under content builds", () => {
  assert.equal(scope("pull_request", ["README.md"], add("content/Café.json")), "apple=true");
});
test("editing the scope script alone builds", () => {
  assert.equal(scope("pull_request", ["README.md"], add("tools/ci/apple-scope.sh")), "apple=true");
});
