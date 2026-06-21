import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server({ name: "fake", version: "0.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "echo", description: "echo back", inputSchema: { type: "object" } },
    { name: "secret", description: "should be filtered out", inputSchema: { type: "object" } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => ({
  content: [
    { type: "text", text: `fake:${req.params.name}:${JSON.stringify(req.params.arguments ?? {})}` },
  ],
}));

process.stdin.on("close", () => process.exit(0));
process.stdin.on("end", () => process.exit(0));

await server.connect(new StdioServerTransport());
