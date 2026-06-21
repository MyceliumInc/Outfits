import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../dist/cli/index.js", import.meta.url));

function run(args) {
  return execFileSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

function runFail(args) {
  try {
    run(args);
    throw new Error("expected non-zero exit");
  } catch (err) {
    return { status: err.status, stderr: err.stderr ?? "", stdout: err.stdout ?? "" };
  }
}

test("--version prints the version", () => {
  assert.match(run(["--version"]).trim(), /^\d+\.\d+\.\d+$/);
});

test("help lists every command", () => {
  const out = run(["help"]);
  for (const cmd of ["list", "doctor", "use", "doff", "status", "gateway", "install-skill"]) {
    assert.ok(out.includes(cmd), `help should mention ${cmd}`);
  }
});

test("per-command help prints that command's usage", () => {
  const out = run(["doctor", "--help"]);
  assert.match(out, /Usage:\s+outfit doctor/);
});

test("an unknown command exits non-zero with a clear message", () => {
  const { status, stderr } = runFail(["frobnicate"]);
  assert.equal(status, 1);
  assert.match(stderr, /Unknown command/);
});

test("an unknown flag exits non-zero with a clean message", () => {
  const { status, stderr } = runFail(["list", "--bogus"]);
  assert.equal(status, 1);
  assert.match(stderr, /Unknown option/);
});
