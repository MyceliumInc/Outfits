import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertShellAllowed,
  assertPathAllowed,
  assertUrlAllowed,
  ScopeViolation,
} from "../dist/index.js";

test("shell allow-list permits matching commands", () => {
  assert.doesNotThrow(() => assertShellAllowed("git status", { allow: ["git *", "git status"] }));
  assert.doesNotThrow(() => assertShellAllowed("rg foo src/", { allow: ["rg *"] }));
});

test("shell allow-list denies by default", () => {
  assert.throws(() => assertShellAllowed("rm -rf /", { allow: ["ls *"] }), ScopeViolation);
  assert.throws(() => assertShellAllowed("anything", {}), ScopeViolation);
});

test("shell deny-list wins over allow", () => {
  assert.throws(
    () => assertShellAllowed("git push origin main", { allow: ["git *"], deny: ["git push*"] }),
    ScopeViolation
  );
});

test("shell glob spans slashes", () => {
  assert.doesNotThrow(() =>
    assertShellAllowed("cat src/a/b/c.ts", { allow: ["cat *"] })
  );
});

test("path allow-list matches relative and absolute globs", () => {
  assert.doesNotThrow(() => assertPathAllowed("src/index.ts", { paths: ["src/**"] }));
  assert.throws(() => assertPathAllowed("etc/passwd", { paths: ["src/**"] }), ScopeViolation);
  assert.throws(() => assertPathAllowed("anything", {}), ScopeViolation);
});

test("path allow-list returns the resolved absolute path", () => {
  const abs = assertPathAllowed("src/index.ts", { paths: ["**/*"] });
  assert.ok(abs.startsWith("/"));
  assert.ok(abs.endsWith("src/index.ts"));
});

test("url domain allow-list matches globs", () => {
  assert.doesNotThrow(() => assertUrlAllowed("https://data.sec.gov/x", { domains: ["*.sec.gov"] }));
  assert.throws(() => assertUrlAllowed("https://evil.com", { domains: ["*.sec.gov"] }), ScopeViolation);
  assert.throws(() => assertUrlAllowed("not a url", { domains: ["*"] }), ScopeViolation);
  assert.throws(() => assertUrlAllowed("https://anywhere.com", {}), ScopeViolation);
});
