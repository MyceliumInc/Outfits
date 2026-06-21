import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Outfit, Capability, Integration, Identity, Skill } from "../dist/index.js";

const schema = JSON.parse(
  readFileSync(fileURLToPath(new URL("../schema/outfit.schema.json", import.meta.url)), "utf8")
);

const keys = (zod) => Object.keys(zod.shape).sort();

test("JSON schema top-level properties match the zod schema", () => {
  assert.deepEqual(Object.keys(schema.properties).sort(), keys(Outfit));
});

test("JSON schema nested objects match the zod shapes", () => {
  assert.deepEqual(Object.keys(schema.properties.capabilities.items.properties).sort(), keys(Capability));
  assert.deepEqual(Object.keys(schema.properties.integrations.items.properties).sort(), keys(Integration));
  assert.deepEqual(Object.keys(schema.properties.identity.properties).sort(), keys(Identity));
  assert.deepEqual(Object.keys(schema.properties.skills.items.properties).sort(), keys(Skill));
});
