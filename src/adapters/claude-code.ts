import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Outfit } from "../spec/index.js";
import { capabilityToToolName } from "../spec/index.js";
import type { Adapter, CompileResult } from "./types.js";

/** Native Claude Code tools that an outfit disables — the gateway replaces them. */
export const NATIVE_TOOLS = [
  "Bash", "Read", "Write", "Edit", "MultiEdit", "NotebookEdit",
  "WebFetch", "WebSearch", "Glob", "Grep", "Task",
];

function serverName(outfit: Outfit): string {
  return `outfit-${outfit.name}`;
}

function skillBlock(outfit: Outfit): string {
  const inline = outfit.skills.filter((s) => s.inline);
  if (!inline.length) return "";
  return (
    "\n\n## Skills\n\n" +
    inline
      .map((s) => `### ${s.id}\n${s.description ? s.description + "\n\n" : ""}${s.inline}`)
      .join("\n\n")
  );
}

function readJson(path: string): any {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function uniq(arr: string[]): string[] {
  return [...new Set(arr)];
}

export const claudeCodeAdapter: Adapter = {
  id: "claude-code",
  title: "Claude Code",
  conformance: {
    routeViaGateway: true,
    denyNative: true,
    hooks: true,
    slashCommands: true,
    integrations: true,
  },

  async compile(outfit: Outfit, outfitPath: string, outDir: string): Promise<CompileResult> {
    const files: string[] = [];
    const notes: string[] = [];
    const name = serverName(outfit);
    const absOutfit = resolve(outfitPath);

    mkdirSync(outDir, { recursive: true });
    mkdirSync(join(outDir, ".claude", "agents"), { recursive: true });

    // 1. Register the gateway as an MCP server.
    const mcpPath = join(outDir, ".mcp.json");
    const mcp = readJson(mcpPath);
    mcp.mcpServers = mcp.mcpServers ?? {};
    mcp.mcpServers[name] = {
      command: "outfit",
      args: ["gateway", "--outfit", absOutfit],
    };
    writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + "\n");
    files.push(mcpPath);

    // 2. Lock the session down: deny native tools, allow only the gateway.
    //    This is the enforcement stance — the gateway is the sole tool source.
    const settingsPath = join(outDir, ".claude", "settings.json");
    const settings = readJson(settingsPath);
    settings.permissions = settings.permissions ?? {};
    settings.permissions.deny = uniq([...(settings.permissions.deny ?? []), ...NATIVE_TOOLS]);
    settings.permissions.allow = uniq([
      ...(settings.permissions.allow ?? []),
      `mcp__${name}__*`,
    ]);

    // 3. Apply runtime extensions (hooks) if present — capability-gated.
    const ext = (outfit.extensions?.["claude-code"] ?? {}) as Record<string, any>;
    if (ext.hooks) {
      settings.hooks = { ...(settings.hooks ?? {}), ...ext.hooks };
    }
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
    files.push(settingsPath);

    // 4. Persona as a subagent, scoped to the gateway's tools.
    const capTools = outfit.capabilities.map(
      (c) => `mcp__${name}__${capabilityToToolName(c.id)}`
    );
    const agentPath = join(outDir, ".claude", "agents", `${outfit.name}.md`);
    const frontmatter = [
      "---",
      `name: ${outfit.name}`,
      `description: ${outfit.description ?? outfit.name}`,
      capTools.length ? `tools: ${capTools.join(", ")}` : "",
      outfit.identity.model ? `model: ${outfit.identity.model}` : "",
      "---",
    ]
      .filter(Boolean)
      .join("\n");
    writeFileSync(agentPath, `${frontmatter}\n\n${outfit.identity.prompt}${skillBlock(outfit)}\n`);
    files.push(agentPath);

    // 5. Inline skills as native Claude skills.
    for (const skill of outfit.skills.filter((s) => s.inline)) {
      const skillDir = join(outDir, ".claude", "skills", skill.id);
      mkdirSync(skillDir, { recursive: true });
      const skillPath = join(skillDir, "SKILL.md");
      const fm = [
        "---",
        `name: ${skill.id}`,
        `description: ${skill.description ?? skill.id}`,
        "---",
      ].join("\n");
      writeFileSync(skillPath, `${fm}\n\n${skill.inline}\n`);
      files.push(skillPath);
    }

    notes.push(
      "Native tools are denied for this project — the agent can only use gateway tools.",
      `Requires the \`outfit\` CLI on PATH (the MCP server runs \`outfit gateway\`).`
    );
    if (ext.slash) {
      notes.push(`Slash command hint: ${ext.slash}`);
    }

    return { files, notes };
  },
};
