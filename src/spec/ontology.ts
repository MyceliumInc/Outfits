/**
 * The capability ontology — the portable, enforced core vocabulary.
 *
 * Every capability listed here is something the Outfit Gateway *implements
 * itself* and enforces identically on every runtime. An outfit that only uses
 * ontology capabilities is fully portable. Anything outside this list must go
 * through `integrations` (raw MCP passthrough), which is explicitly non-portable.
 *
 * This is v0 of a living registry. Add capabilities here, give them an input
 * schema and a handler in `gateway/capabilities.ts`, and they become available
 * to every adapter at once.
 */

export type ScopeKind = "shell" | "fs" | "net";

export interface CapabilityDef {
  /** Dotted capability id, e.g. "shell.exec". */
  id: string;
  /** One-line description surfaced to the model as the tool description. */
  summary: string;
  /** True if every adapter can map this capability (i.e. the gateway owns it). */
  portable: boolean;
  /** Which scope shape this capability is constrained by. */
  scope: ScopeKind;
  /** JSON Schema for the tool input the model calls with. */
  inputSchema: Record<string, unknown>;
}

export const ONTOLOGY: Record<string, CapabilityDef> = {
  "shell.exec": {
    id: "shell.exec",
    summary: "Run a shell command. Constrained to an allow-list of command patterns.",
    portable: true,
    scope: "shell",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to execute." },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
  "fs.read": {
    id: "fs.read",
    summary: "Read a file from disk. Constrained to an allow-list of path globs.",
    portable: true,
    scope: "fs",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file to read." },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  "fs.write": {
    id: "fs.write",
    summary: "Write a file to disk. Constrained to an allow-list of path globs.",
    portable: true,
    scope: "fs",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file to write." },
        content: { type: "string", description: "Content to write." },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
  "fs.list": {
    id: "fs.list",
    summary: "List the contents of a directory. Constrained to an allow-list of path globs.",
    portable: true,
    scope: "fs",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path to list." },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  "http.fetch": {
    id: "http.fetch",
    summary: "Make an HTTP request. Constrained to an allow-list of domains.",
    portable: true,
    scope: "net",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to request." },
        method: { type: "string", description: "HTTP method (default GET)." },
        headers: { type: "object", description: "Request headers.", additionalProperties: { type: "string" } },
        body: { type: "string", description: "Request body." },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  "web.search": {
    id: "web.search",
    summary: "Search the web. Requires a configured search provider.",
    portable: true,
    scope: "net",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query." },
        count: { type: "number", description: "Max number of results (default 5)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

export function isKnownCapability(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(ONTOLOGY, id);
}

/** MCP tool names disallow dots; map capability ids to a safe tool name and back. */
export function capabilityToToolName(id: string): string {
  return id.replace(/\./g, "_");
}
