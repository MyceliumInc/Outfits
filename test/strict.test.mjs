import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadOutfit, assertPathAllowed, assertUrlAllowed, ScopeViolation } from "../dist/index.js";

test("schema rejects an unknown nested key instead of dropping it", () => {
  const dir = mkdtempSync(join(tmpdir(), "outfit-strict-"));
  try {
    const file = join(dir, "bad.outfit.yaml");
    writeFileSync(file, "apiVersion: outfit/v1\nname: bad\nidentity:\n  prompt: hi\n  promt: typo\n");
    assert.throws(() => loadOutfit(file), /Invalid outfit spec/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("schema rejects an unknown capability key", () => {
  const dir = mkdtempSync(join(tmpdir(), "outfit-strict2-"));
  try {
    const file = join(dir, "bad.outfit.yaml");
    writeFileSync(
      file,
      "apiVersion: outfit/v1\nname: bad\nidentity:\n  prompt: hi\ncapabilities:\n  - id: fs.read\n    scop: {}\n"
    );
    assert.throws(() => loadOutfit(file), /Invalid outfit spec/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a nested new-file write keeps the full canonical path", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "outfit-nested-")));
  try {
    const out = assertPathAllowed(join(dir, "newdir", "sub", "file.txt"), { paths: [join(dir, "**")] });
    assert.ok(out.endsWith(join("newdir", "sub", "file.txt")), out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("internal and link-local hosts are blocked unless explicitly allow-listed", () => {
  assert.throws(
    () => assertUrlAllowed("http://169.254.169.254/latest/meta-data", { domains: ["*"] }),
    ScopeViolation
  );
  assert.throws(() => assertUrlAllowed("http://127.0.0.1/", { domains: ["*"] }), ScopeViolation);
  assert.throws(() => assertUrlAllowed("http://localhost/", { domains: ["*"] }), ScopeViolation);
  assert.doesNotThrow(() => assertUrlAllowed("http://127.0.0.1/", { domains: ["127.0.0.1"] }));
});

test("IPv6 internal literals are blocked even when bracketed", () => {
  for (const url of ["http://[::1]/", "http://[fd00::1]/", "http://[fe80::1]/", "http://[::ffff:127.0.0.1]/"]) {
    assert.throws(() => assertUrlAllowed(url, { domains: ["*"] }), ScopeViolation, url);
  }
});

test("IPv4 disguised encodings are normalized and blocked", () => {
  for (const url of ["http://0x7f000001/", "http://2130706433/", "http://0177.0.0.1/"]) {
    assert.throws(() => assertUrlAllowed(url, { domains: ["*"] }), ScopeViolation, url);
  }
});
