import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadOutfit, doctor, getAdapter } from "../dist/index.js";
import {
  claudeCodeAdapter,
  personaMarkers,
  upsertBlock,
  removeBlock,
} from "../dist/adapters/claude-code.js";

test("persona block round-trips and preserves surrounding content", () => {
  const markers = personaMarkers("demo");
  const block = `${markers.start}\npersona body\n${markers.end}`;
  const base = "# My Project\n\nUser notes.\n";
  const withBlock = upsertBlock(base, markers, block);
  assert.ok(withBlock.includes("User notes."));
  assert.ok(withBlock.includes("persona body"));
  const stripped = removeBlock(withBlock, markers);
  assert.equal(stripped.trim(), "# My Project\n\nUser notes.".trim());
});

test("upsertBlock replaces an existing block instead of appending", () => {
  const markers = personaMarkers("demo");
  const v1 = upsertBlock("", markers, `${markers.start}\nv1\n${markers.end}`);
  const v2 = upsertBlock(v1, markers, `${markers.start}\nv2\n${markers.end}`);
  assert.ok(v2.includes("v2"));
  assert.ok(!v2.includes("v1"));
  assert.equal(v2.indexOf(markers.start), v2.lastIndexOf(markers.start));
});

test("claude-code compile clothes the main session via CLAUDE.md", async () => {
  const dir = mkdtempSync(join(tmpdir(), "outfit-test-"));
  try {
    writeFileSync(join(dir, "CLAUDE.md"), "# Existing\n\nKeep me.\n");
    const { outfit, path } = loadOutfit("examples/code-reviewer.outfit.yaml");
    const result = await claudeCodeAdapter.compile(outfit, path, dir);

    const claude = readFileSync(join(dir, "CLAUDE.md"), "utf8");
    assert.ok(claude.includes("Keep me."));
    assert.ok(claude.includes("senior code reviewer"));

    assert.ok(!existsSync(join(dir, ".claude", "agents")));

    const settings = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8"));
    assert.ok(settings.permissions.deny.includes("Task"));
    assert.ok(settings.permissions.deny.includes("Edit"));
    assert.ok(settings.permissions.allow.includes("mcp__outfit-code-reviewer__*"));

    const mcp = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
    assert.ok(mcp.mcpServers["outfit-code-reviewer"].args.includes("gateway"));

    assert.ok(result.files.some((f) => f.endsWith("CLAUDE.md")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("doctor passes for an enforceable outfit and fails for an unsupported target", () => {
  const { outfit } = loadOutfit("examples/code-reviewer.outfit.yaml");
  assert.ok(doctor(outfit, "claude-code").ok);
  assert.throws(() => getAdapter("nonexistent-runtime"));
});
