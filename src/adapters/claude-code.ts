import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Outfit } from "../spec/index.js";
import type { Adapter, CompileResult } from "./types.js";

export const NATIVE_TOOLS = [
  "Bash", "BashOutput", "KillShell", "Read", "Write", "Edit", "MultiEdit",
  "NotebookEdit", "WebFetch", "WebSearch", "Glob", "Grep", "Task",
  "TodoWrite", "ExitPlanMode", "SlashCommand",
];

function serverName(outfit: Outfit): string {
  return `outfit-${outfit.name}`;
}

export function personaMarkers(name: string): { start: string; end: string } {
  return { start: `<!-- outfit:${name}:start -->`, end: `<!-- outfit:${name}:end -->` };
}

export function upsertBlock(
  content: string,
  markers: { start: string; end: string },
  block: string
): string {
  const s = content.indexOf(markers.start);
  const e = content.indexOf(markers.end);
  if (s !== -1 && e !== -1 && e > s) {
    const before = content.slice(0, s);
    const after = content.slice(e + markers.end.length);
    return `${before}${block}${after}`;
  }
  const base = content.trim();
  return base ? `${base}\n\n${block}\n` : `${block}\n`;
}

export function removeBlock(
  content: string,
  markers: { start: string; end: string }
): string {
  const s = content.indexOf(markers.start);
  const e = content.indexOf(markers.end);
  if (s === -1 || e === -1 || e < s) return content;
  const before = content.slice(0, s).replace(/\n+$/, "");
  const after = content.slice(e + markers.end.length).replace(/^\n+/, "");
  const joined = [before, after].filter(Boolean).join("\n\n");
  return joined ? joined.replace(/\n*$/, "\n") : "";
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
    mkdirSync(join(outDir, ".claude"), { recursive: true });

    const mcpPath = join(outDir, ".mcp.json");
    const mcp = readJson(mcpPath);
    mcp.mcpServers = mcp.mcpServers ?? {};
    mcp.mcpServers[name] = {
      command: "outfit",
      args: ["gateway", "--outfit", absOutfit],
    };
    writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + "\n");
    files.push(mcpPath);

    const settingsPath = join(outDir, ".claude", "settings.json");
    const settings = readJson(settingsPath);
    settings.permissions = settings.permissions ?? {};
    settings.permissions.deny = uniq([...(settings.permissions.deny ?? []), ...NATIVE_TOOLS]);
    settings.permissions.allow = uniq([
      ...(settings.permissions.allow ?? []),
      `mcp__${name}__*`,
    ]);

    const ext = (outfit.extensions?.["claude-code"] ?? {}) as Record<string, any>;
    if (ext.hooks) {
      settings.hooks = { ...(settings.hooks ?? {}), ...ext.hooks };
    }
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
    files.push(settingsPath);

    const claudePath = join(outDir, "CLAUDE.md");
    const markers = personaMarkers(outfit.name);
    const persona = `# Outfit: ${outfit.name}\n\n${outfit.identity.prompt.trim()}${skillBlock(outfit)}`;
    const block = `${markers.start}\n${persona}\n${markers.end}`;
    const existing = existsSync(claudePath) ? readFileSync(claudePath, "utf8") : "";
    writeFileSync(claudePath, upsertBlock(existing, markers, block));
    files.push(claudePath);
    if (outfit.identity.model) {
      notes.push(
        `Outfit requests model '${outfit.identity.model}', but a worn outfit shares the main session's model - set it with /model.`
      );
    }

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
      "Native tools are denied for this project - the agent can only use gateway tools.",
      "Requires the `outfit` CLI on PATH (the MCP server runs `outfit gateway`)."
    );
    if (ext.slash) {
      notes.push(`Slash command hint: ${ext.slash}`);
    }

    return { files, notes };
  },
};
