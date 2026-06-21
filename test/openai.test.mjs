import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getAdapter, loadOutfit } from "../dist/index.js";

test("openai-agents compile emits a gateway-backed agent script", async () => {
  const dir = mkdtempSync(join(tmpdir(), "outfit-oai-"));
  try {
    const { outfit, path } = loadOutfit("examples/repo-researcher.outfit.yaml");
    const result = await getAdapter("openai-agents").compile(outfit, path, dir);
    assert.equal(result.files.length, 1);
    const script = readFileSync(result.files[0], "utf8");
    assert.match(script, /MCPServerStdio/);
    assert.match(script, /"gateway"/);
    assert.ok(script.includes(outfit.name));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
