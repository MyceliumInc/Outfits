import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadOutfit,
  validateSemantics,
  capabilityToToolName,
  isKnownCapability,
  resolveOutfit,
} from "../dist/index.js";

test("loads a valid example outfit with defaults applied", () => {
  const { outfit } = loadOutfit("examples/code-reviewer.outfit.yaml");
  assert.equal(outfit.name, "code-reviewer");
  assert.equal(outfit.apiVersion, "outfit/v1");
  assert.equal(outfit.capabilities[0].id, "shell.exec");
  assert.ok(Array.isArray(outfit.capabilities[0].scope.allow));
});

test("rejects an unknown capability in semantic validation", () => {
  const issues = validateSemantics({
    capabilities: [{ id: "nuclear.launch", enforcement: "hard", scope: {} }],
    integrations: [],
  });
  assert.ok(issues.some((i) => i.level === "error" && i.message.includes("nuclear.launch")));
});

test("warns when a shell capability has no allow-list", () => {
  const issues = validateSemantics({
    capabilities: [{ id: "shell.exec", enforcement: "hard", scope: {} }],
    integrations: [],
  });
  assert.ok(issues.some((i) => i.level === "warning"));
});

test("capability ids map to dot-free tool names", () => {
  assert.equal(capabilityToToolName("shell.exec"), "shell_exec");
  assert.equal(capabilityToToolName("fs.read"), "fs_read");
});

test("ontology membership check", () => {
  assert.ok(isKnownCapability("web.search"));
  assert.ok(!isKnownCapability("web.teleport"));
});

test("resolveOutfit finds bundled examples by name", () => {
  const { outfit } = resolveOutfit("stock-analyst");
  assert.equal(outfit.name, "stock-analyst");
});

test("loadOutfit throws a helpful error on a missing file", () => {
  assert.throws(() => loadOutfit("examples/does-not-exist.outfit.yaml"), /not found/);
});
