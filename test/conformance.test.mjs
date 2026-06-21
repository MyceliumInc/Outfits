import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ADAPTERS, loadOutfit } from "../dist/index.js";
import { NATIVE_TOOLS } from "../dist/adapters/claude-code.js";

test("a denyNative adapter denies every native tool and allows only its gateway", async () => {
  const dir = mkdtempSync(join(tmpdir(), "outfit-conf-"));
  try {
    const { outfit, path } = loadOutfit("examples/code-reviewer.outfit.yaml");
    await ADAPTERS["claude-code"].compile(outfit, path, dir);
    const settings = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8"));
    for (const tool of NATIVE_TOOLS) {
      assert.ok(settings.permissions.deny.includes(tool), `deny should include ${tool}`);
    }
    assert.deepEqual(settings.permissions.allow, ["mcp__outfit-code-reviewer__*"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("compile merges into existing config without clobbering or duplicating", async () => {
  const dir = mkdtempSync(join(tmpdir(), "outfit-merge-"));
  try {
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "x" } } }));
    writeFileSync(
      join(dir, ".claude", "settings.json"),
      JSON.stringify({ permissions: { deny: ["CustomTool"], allow: ["mcp__keep__*"] } })
    );
    const { outfit, path } = loadOutfit("examples/code-reviewer.outfit.yaml");
    await ADAPTERS["claude-code"].compile(outfit, path, dir);
    await ADAPTERS["claude-code"].compile(outfit, path, dir);

    const mcp = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
    assert.ok(mcp.mcpServers.other);
    assert.ok(mcp.mcpServers["outfit-code-reviewer"]);

    const s = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8"));
    assert.ok(s.permissions.deny.includes("CustomTool"));
    assert.ok(s.permissions.allow.includes("mcp__keep__*"));
    assert.equal(s.permissions.deny.filter((x) => x === "Bash").length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
