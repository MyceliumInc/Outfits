import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../dist/cli/index.js", import.meta.url));

function outfit(cwd, ...args) {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

test("use then doff restores the project and removes created files", () => {
  const dir = mkdtempSync(join(tmpdir(), "outfit-life-"));
  try {
    writeFileSync(join(dir, "CLAUDE.md"), "# App\n\nKeep me.\n");
    outfit(dir, "use", "stock-analyst");
    assert.ok(existsSync(join(dir, ".mcp.json")));
    assert.ok(readFileSync(join(dir, "CLAUDE.md"), "utf8").includes("equity analyst"));
    assert.ok(existsSync(join(dir, ".claude", "skills", "dcf-model", "SKILL.md")));

    outfit(dir, "doff");
    const claude = readFileSync(join(dir, "CLAUDE.md"), "utf8");
    assert.ok(claude.includes("Keep me."));
    assert.ok(!claude.includes("equity analyst"));
    assert.ok(!existsSync(join(dir, ".mcp.json")));
    assert.ok(!existsSync(join(dir, ".claude", "settings.json")));
    assert.ok(!existsSync(join(dir, ".claude", "skills", "dcf-model")));
    assert.ok(!existsSync(join(dir, ".outfit", "applied.json")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("use replaces a previously worn outfit without orphaning it", () => {
  const dir = mkdtempSync(join(tmpdir(), "outfit-life2-"));
  try {
    outfit(dir, "use", "stock-analyst");
    outfit(dir, "use", "code-reviewer");
    const mcp = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
    assert.deepEqual(Object.keys(mcp.mcpServers), ["outfit-code-reviewer"]);
    const claude = readFileSync(join(dir, "CLAUDE.md"), "utf8");
    assert.ok(claude.includes("code reviewer"));
    assert.ok(!claude.includes("equity analyst"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("doff preserves the user's pre-existing settings and denials", () => {
  const dir = mkdtempSync(join(tmpdir(), "outfit-life3-"));
  try {
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(
      join(dir, ".claude", "settings.json"),
      JSON.stringify({ permissions: { deny: ["Bash"], allow: [] } }, null, 2)
    );
    outfit(dir, "use", "code-reviewer");
    outfit(dir, "doff");
    assert.ok(existsSync(join(dir, ".claude", "settings.json")));
    const s = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8"));
    assert.deepEqual(s.permissions.deny, ["Bash"]);
    assert.deepEqual(s.permissions.allow, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
