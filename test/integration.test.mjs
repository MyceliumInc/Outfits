import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildGatewayServer } from "../dist/index.js";

const FAKE = fileURLToPath(new URL("./fixtures/fake-mcp-server.mjs", import.meta.url));

function outfitWith(allowTools) {
  return {
    apiVersion: "outfit/v1",
    name: "proxy-tester",
    version: "0.0.0",
    identity: { prompt: "p" },
    capabilities: [],
    skills: [],
    integrations: [
      { id: "fake", kind: "mcp", enforcement: "hard", command: process.execPath, args: [FAKE], env: {}, allowTools },
    ],
    extensions: {},
  };
}

async function connect(outfit) {
  const { server, close } = await buildGatewayServer(outfit);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientTransport);
  return { client, close };
}

test("gateway proxies integration tools and honors allowTools", async () => {
  const { client, close } = await connect(outfitWith(["echo"]));
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name), ["fake__echo"]);
    const res = await client.callTool({ name: "fake__echo", arguments: { a: 1 } });
    assert.match(res.content[0].text, /fake:echo/);
  } finally {
    await client.close();
    await close();
  }
});

test("empty allowTools exposes every upstream tool", async () => {
  const { client, close } = await connect(outfitWith([]));
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ["fake__echo", "fake__secret"]);
  } finally {
    await client.close();
    await close();
  }
});

test("a hard integration that cannot launch fails to build", async () => {
  const outfit = outfitWith(["echo"]);
  outfit.integrations[0].command = "definitely-not-a-real-binary-xyz";
  await assert.rejects(buildGatewayServer(outfit));
});
