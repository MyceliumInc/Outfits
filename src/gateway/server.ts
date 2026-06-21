import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Outfit, ONTOLOGY, capabilityToToolName } from "../spec/index.js";
import { HANDLERS } from "./capabilities.js";

/** stderr logger — stdout is reserved for the MCP protocol. */
function log(msg: string) {
  process.stderr.write(`[outfit-gateway] ${msg}\n`);
}

interface ExposedTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** "capability" => handled locally; "integration" => proxied upstream. */
  kind: "capability" | "integration";
  capabilityId?: string;
  scope?: Record<string, any>;
  client?: Client;
  upstreamName?: string;
}

/**
 * The Outfit Gateway: an MCP server that IS the agent's entire tool-world.
 *
 * - Capabilities are implemented and enforced locally by the gateway.
 * - Integrations are launched as child MCP servers and proxied through, exposing
 *   only the tools the contract allows.
 *
 * Whatever the runtime, the agent can only do what this gateway exposes.
 */
export async function runGateway(outfit: Outfit): Promise<void> {
  const tools: ExposedTool[] = [];

  // 1. Capability tools — the portable, locally enforced core.
  for (const cap of outfit.capabilities) {
    const def = ONTOLOGY[cap.id];
    if (!def) {
      log(`skipping unknown capability "${cap.id}"`);
      continue;
    }
    if (!HANDLERS[cap.id]) {
      log(`no handler for capability "${cap.id}"`);
      continue;
    }
    tools.push({
      name: capabilityToToolName(cap.id),
      description: def.summary,
      inputSchema: def.inputSchema,
      kind: "capability",
      capabilityId: cap.id,
      scope: cap.scope,
    });
  }

  // 2. Integration tools — raw MCP passthrough, gated to allowTools.
  const clients: Client[] = [];
  for (const integ of outfit.integrations) {
    if (!integ.command) {
      log(`integration "${integ.id}" has no command; skipping`);
      continue;
    }
    try {
      const client = new Client({ name: `outfit-proxy-${integ.id}`, version: "0.1.0" });
      const transport = new StdioClientTransport({
        command: integ.command,
        args: integ.args,
        env: { ...process.env, ...integ.env } as Record<string, string>,
      });
      await client.connect(transport);
      clients.push(client);
      const { tools: upstream } = await client.listTools();
      const allow = new Set(integ.allowTools);
      for (const t of upstream) {
        if (allow.size && !allow.has(t.name)) continue;
        tools.push({
          name: `${integ.id}__${t.name}`,
          description: t.description ?? `(${integ.id}) ${t.name}`,
          inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: "object" },
          kind: "integration",
          client,
          upstreamName: t.name,
        });
      }
      log(`integration "${integ.id}" connected (${upstream.length} tools upstream)`);
    } catch (err: any) {
      const msg = `integration "${integ.id}" failed to launch: ${err.message}`;
      if (integ.enforcement === "hard") {
        log(`FATAL: ${msg}`);
        throw new Error(msg);
      }
      log(`WARN: ${msg}`);
    }
  }

  const byName = new Map(tools.map((t) => [t.name, t]));

  const server = new Server(
    { name: `outfit-${outfit.name}`, version: outfit.version },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = byName.get(req.params.name);
    const args = (req.params.arguments ?? {}) as Record<string, any>;
    if (!tool) {
      return { content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }], isError: true };
    }
    try {
      if (tool.kind === "capability") {
        const text = await HANDLERS[tool.capabilityId!](args, tool.scope ?? {});
        return { content: [{ type: "text", text }] };
      }
      // Proxy to the upstream integration, contract already enforced by exposure.
      const result = await tool.client!.callTool({
        name: tool.upstreamName!,
        arguments: args,
      });
      return result as any;
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `${err.name ?? "Error"}: ${err.message}` }],
        isError: true,
      };
    }
  });

  log(`wearing "${outfit.name}" — exposing ${tools.length} tool(s): ${tools.map((t) => t.name).join(", ")}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async () => {
    for (const c of clients) {
      try { await c.close(); } catch { /* ignore */ }
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
