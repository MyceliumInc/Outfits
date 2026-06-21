import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildGatewayServer } from "../dist/index.js";

const outfit = {
  apiVersion: "outfit/v1",
  name: "tester",
  version: "0.0.0",
  identity: { prompt: "p" },
  capabilities: [{ id: "shell.exec", scope: { allow: ["echo *"] } }],
  skills: [],
  integrations: [],
  extensions: {},
};

async function connect() {
  const { server, close } = await buildGatewayServer(outfit);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientTransport);
  return { client, close };
}

test("gateway lists only the outfit's capability tools", async () => {
  const { client, close } = await connect();
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name), ["shell_exec"]);
  } finally {
    await client.close();
    await close();
  }
});

test("gateway routes an allowed capability call to its handler", async () => {
  const { client, close } = await connect();
  try {
    const res = await client.callTool({ name: "shell_exec", arguments: { command: "echo hi" } });
    assert.match(res.content[0].text, /hi/);
  } finally {
    await client.close();
    await close();
  }
});

test("gateway returns isError for an unknown tool", async () => {
  const { client, close } = await connect();
  try {
    const res = await client.callTool({ name: "does_not_exist", arguments: {} });
    assert.equal(res.isError, true);
  } finally {
    await client.close();
    await close();
  }
});
