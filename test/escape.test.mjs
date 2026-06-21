import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assertPathAllowed, ScopeViolation } from "../dist/index.js";

test("fs allow-list confines **/* to the project, not absolute paths", () => {
  assert.throws(() => assertPathAllowed("/etc/passwd", { paths: ["**/*"] }), ScopeViolation);
  assert.throws(
    () => assertPathAllowed("../../../../../../etc/passwd", { paths: ["**/*"] }),
    ScopeViolation
  );
  assert.doesNotThrow(() => assertPathAllowed("src/index.ts", { paths: ["**/*"] }));
});

test("fs target via a dangling symlink is blocked", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "outfit-dangle-")));
  const outside = realpathSync(mkdtempSync(join(tmpdir(), "outfit-out-")));
  try {
    symlinkSync(join(outside, "SECRET"), join(dir, "evil"));
    assert.throws(
      () => assertPathAllowed(join(dir, "evil"), { paths: [join(dir, "**")] }),
      ScopeViolation
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("a chain of symlinks cannot escape the allow-list", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "outfit-chain-")));
  const outside = realpathSync(mkdtempSync(join(tmpdir(), "outfit-chainout-")));
  try {
    symlinkSync(join(dir, "inner"), join(dir, "door"));
    symlinkSync(outside, join(dir, "inner"));
    assert.throws(
      () => assertPathAllowed(join(dir, "door", "secret"), { paths: [join(dir, "**")] }),
      ScopeViolation
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("an explicit absolute allow-list still works", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "outfit-abs-")));
  try {
    assert.doesNotThrow(() => assertPathAllowed(join(dir, "a.txt"), { paths: [join(dir, "**")] }));
    assert.throws(() => assertPathAllowed("/etc/passwd", { paths: [join(dir, "**")] }), ScopeViolation);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
