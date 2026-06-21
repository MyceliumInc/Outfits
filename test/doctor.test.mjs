import { test } from "node:test";
import assert from "node:assert/strict";
import { loadOutfit, doctor } from "../dist/index.js";

test("doctor warns (not errors) when a capability's required env is missing", () => {
  const prevProvider = process.env.OUTFIT_SEARCH_PROVIDER;
  const prevKey = process.env.OUTFIT_SEARCH_API_KEY;
  delete process.env.OUTFIT_SEARCH_PROVIDER;
  delete process.env.OUTFIT_SEARCH_API_KEY;
  try {
    const { outfit } = loadOutfit("examples/stock-analyst.outfit.yaml");
    const report = doctor(outfit, "claude-code");
    assert.ok(report.ok);
    assert.ok(
      report.issues.some(
        (i) => i.level === "warning" && i.message.includes("OUTFIT_SEARCH_PROVIDER")
      )
    );
  } finally {
    if (prevProvider !== undefined) process.env.OUTFIT_SEARCH_PROVIDER = prevProvider;
    if (prevKey !== undefined) process.env.OUTFIT_SEARCH_API_KEY = prevKey;
  }
});

test("doctor fails for an outfit with an unsatisfiable hard integration", () => {
  const outfit = {
    apiVersion: "outfit/v1",
    name: "ghosted",
    version: "0.0.0",
    identity: { prompt: "p" },
    capabilities: [],
    skills: [],
    integrations: [
      {
        id: "ghost",
        kind: "mcp",
        enforcement: "hard",
        command: "definitely-not-a-real-binary-xyz",
        args: [],
        env: {},
        allowTools: [],
      },
    ],
    extensions: {},
  };
  const report = doctor(outfit, "claude-code");
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((i) => i.level === "error"));
});
