import { test } from "node:test";
import assert from "node:assert/strict";
import { personaMarkers, upsertBlock, removeBlock } from "../dist/adapters/claude-code.js";

const markers = personaMarkers("demo");
const block = `${markers.start}\nbody\n${markers.end}`;

test("removeBlock returns content unchanged when markers are absent", () => {
  const content = "# Just docs\n\nNo outfit here.\n";
  assert.equal(removeBlock(content, markers), content);
});

test("removeBlock leaves a single trailing newline, not a doubled one", () => {
  const withBlock = `${block}\n\nUser text after.\n`;
  const out = removeBlock(withBlock, markers);
  assert.equal(out, "User text after.\n");
  assert.ok(!out.includes("\n\n\n"));
});

test("removeBlock empties a file that held only the block", () => {
  assert.equal(removeBlock(`${block}\n`, markers), "");
});

test("upsertBlock is idempotent and never stacks blocks", () => {
  let content = "# Doc\n";
  content = upsertBlock(content, markers, block);
  content = upsertBlock(content, markers, block);
  const count = content.split(markers.start).length - 1;
  assert.equal(count, 1);
});
