export type ScopeKind = "shell" | "fs" | "net";

export interface ScopeKindDef {
  requiredKeys: string[];
  emptyWarning: string;
}

export const SCOPE_KINDS: Record<ScopeKind, ScopeKindDef> = {
  shell: { requiredKeys: ["allow"], emptyWarning: 'has no "allow" list - every command will be denied.' },
  fs: { requiredKeys: ["paths"], emptyWarning: 'has no "paths" list - every path will be denied.' },
  net: { requiredKeys: ["domains"], emptyWarning: 'has no "domains" list - every request will be denied.' },
};

export interface CapabilityDef {
  id: string;
  summary: string;
  portable: boolean;
  scope: ScopeKind;
  inputSchema: Record<string, unknown>;
  requiresEnv?: string[];
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
    requiresEnv: ["OUTFIT_SEARCH_PROVIDER", "OUTFIT_SEARCH_API_KEY"],
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

export function capabilityToToolName(id: string): string {
  return id.replace(/\./g, "_");
}
