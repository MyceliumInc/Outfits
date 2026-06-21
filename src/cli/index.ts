#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { parseArgs } from "node:util";
import {
  loadOutfit,
  resolveOutfit,
  discoverOutfits,
  validateSemantics,
  ONTOLOGY,
} from "../spec/index.js";
import { getAdapter, ADAPTERS } from "../adapters/index.js";
import { NATIVE_TOOLS, personaMarkers, removeBlock } from "../adapters/claude-code.js";
import { runGateway } from "../gateway/index.js";
import { doctor } from "./doctor.js";

const VERSION = "0.1.0";

const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const paint = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const C = {
  dim: paint("2"),
  bold: paint("1"),
  green: paint("32"),
  red: paint("31"),
  yellow: paint("33"),
  cyan: paint("36"),
};

class CliError extends Error {}

function die(msg: string): never {
  throw new CliError(msg);
}

interface Parsed {
  positionals: string[];
  values: Record<string, string | boolean | undefined>;
}

function parse(argv: string[]): Parsed {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      target: { type: "string", short: "t" },
      out: { type: "string", short: "o" },
      outfit: { type: "string" },
      json: { type: "boolean" },
      force: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  return { positionals, values: values as Parsed["values"] };
}

function target(p: Parsed): string {
  return (p.values.target as string) ?? "claude-code";
}

function isOutfitDevRepo(dir: string): boolean {
  let cur = resolve(dir);
  while (true) {
    const pkgPath = join(cur, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        if (pkg.name === "outfit" && pkg.bin?.outfit) return true;
      } catch {}
    }
    const parent = dirname(cur);
    if (parent === cur) return false;
    cur = parent;
  }
}

function printIssues(issues: { level: string; message: string }[]): void {
  for (const i of issues) {
    const tag = i.level === "error" ? C.red("error") : C.yellow("warn ");
    console.log(`  ${tag}  ${i.message}`);
  }
}

const commands: Record<string, { summary: string; run: (p: Parsed) => Promise<void> | void }> = {
  list: {
    summary: "List available outfits across search paths",
    run(p) {
      const found = discoverOutfits();
      if (p.values.json) {
        console.log(
          JSON.stringify(
            found.map((f) => ({
              name: f.outfit.name,
              description: f.outfit.description,
              version: f.outfit.version,
              path: f.path,
            })),
            null,
            2
          )
        );
        return;
      }
      if (!found.length) {
        console.log(C.dim("No outfits found. Create one with `outfit init <name>`."));
        return;
      }
      console.log(C.bold("\nAvailable outfits:\n"));
      for (const f of found) {
        console.log(`  ${C.cyan(f.outfit.name)} ${C.dim("v" + f.outfit.version)}`);
        if (f.outfit.description) console.log(`    ${f.outfit.description}`);
        console.log(C.dim(`    ${f.path}`));
      }
      console.log();
    },
  },

  validate: {
    summary: "Validate an outfit against the schema and ontology",
    run(p) {
      const ref = p.positionals[0] ?? die("Usage: outfit validate <fileOrName>");
      const { outfit } = resolveOutfit(ref);
      const issues = validateSemantics(outfit);
      if (!issues.length) {
        console.log(C.green(`✓ ${outfit.name} is valid.`));
        return;
      }
      printIssues(issues);
      if (issues.some((i) => i.level === "error")) process.exitCode = 1;
    },
  },

  doctor: {
    summary: "Preflight: can the target runtime enforce this outfit?",
    run(p) {
      const ref = p.positionals[0] ?? die("Usage: outfit doctor <fileOrName> [-t target]");
      const { outfit } = resolveOutfit(ref);
      const report = doctor(outfit, target(p));
      const adapter = getAdapter(target(p));
      console.log(C.bold(`\nDoctor: ${outfit.name} → ${adapter.title}\n`));

      console.log(C.dim("  Capabilities:"));
      for (const cap of outfit.capabilities) {
        const known = ONTOLOGY[cap.id];
        const mark = known ? C.green("✓") : C.red("✗");
        console.log(`    ${mark} ${cap.id} ${C.dim(`(${cap.enforcement})`)}`);
      }
      if (outfit.integrations.length) {
        console.log(C.dim("  Integrations:"));
        for (const i of outfit.integrations) {
          console.log(`    ${C.yellow("•")} ${i.id} ${C.dim(`(${i.enforcement}, non-portable)`)}`);
        }
      }

      if (report.issues.length) {
        console.log();
        printIssues(report.issues);
      }
      console.log();
      if (report.ok) {
        console.log(C.green(`✓ ${adapter.title} can enforce this outfit.\n`));
      } else {
        console.log(C.red(`✗ ${adapter.title} cannot enforce this outfit as specified.\n`));
        process.exitCode = 1;
      }
    },
  },

  compile: {
    summary: "Compile an outfit into runtime config",
    async run(p) {
      const ref = p.positionals[0] ?? die("Usage: outfit compile <fileOrName> -t <target> -o <dir>");
      const { outfit, path } = resolveOutfit(ref);
      const report = doctor(outfit, target(p));
      if (!report.ok) {
        printIssues(report.issues.filter((x) => x.level === "error"));
        die(`Cannot compile: ${getAdapter(target(p)).title} cannot enforce this outfit.`);
      }
      const adapter = getAdapter(target(p));
      const outDir = resolve((p.values.out as string) ?? ".");
      const result = await adapter.compile(outfit, path, outDir);
      console.log(C.green(`✓ Compiled ${outfit.name} → ${adapter.title}`));
      for (const f of result.files) console.log(C.dim(`  + ${relative(process.cwd(), f)}`));
      for (const n of result.notes) console.log(C.dim(`  ℹ ${n}`));
    },
  },

  use: {
    summary: "Wear an outfit in the current project (Claude Code)",
    async run(p) {
      const ref = p.positionals[0] ?? die("Usage: outfit use <fileOrName> [-t target] [--force]");
      const cwd = process.cwd();
      if (isOutfitDevRepo(cwd) && !p.values.force) {
        die(
          "Refusing to wear an outfit inside the outfit source repo — it would deny the\n" +
            "  native tools you need to develop here, locking this session until `outfit doff`.\n" +
            "  Wear it in a separate project, or pass --force if you really mean to."
        );
      }
      const { outfit, path } = resolveOutfit(ref);
      const report = doctor(outfit, target(p));
      if (!report.ok) {
        printIssues(report.issues.filter((x) => x.level === "error"));
        die("Cannot wear this outfit — see errors above.");
      }
      const adapter = getAdapter(target(p));
      const result = await adapter.compile(outfit, path, cwd);

      mkdirSync(join(cwd, ".outfit"), { recursive: true });
      writeFileSync(
        join(cwd, ".outfit", "applied.json"),
        JSON.stringify(
          { name: outfit.name, target: target(p), serverName: `outfit-${outfit.name}`, files: result.files },
          null,
          2
        ) + "\n"
      );
      console.log(C.green(`✓ Now wearing ${C.bold(outfit.name)} (${adapter.title}).`));
      for (const n of result.notes) console.log(C.dim(`  ℹ ${n}`));
      console.log(C.yellow("  Native tools are denied until you restart — reload Claude Code now."));
      console.log(C.dim("  Take it off any time with `outfit doff`."));
    },
  },

  doff: {
    summary: "Remove the currently worn outfit from this project",
    run() {
      const cwd = process.cwd();
      const manifestPath = join(cwd, ".outfit", "applied.json");
      if (!existsSync(manifestPath)) die("No outfit is currently worn here.");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

      for (const f of manifest.files as string[]) {
        if (f.endsWith(".mcp.json") || f.endsWith("settings.json")) continue;
        if (f.endsWith("CLAUDE.md")) {
          if (!existsSync(f)) continue;
          const stripped = removeBlock(readFileSync(f, "utf8"), personaMarkers(manifest.name));
          if (stripped.trim()) writeFileSync(f, stripped);
          else rmSync(f, { force: true });
          continue;
        }
        try { rmSync(f, { force: true }); } catch {}
      }

      const mcpPath = join(cwd, ".mcp.json");
      if (existsSync(mcpPath)) {
        const mcp = JSON.parse(readFileSync(mcpPath, "utf8"));
        if (mcp.mcpServers) delete mcp.mcpServers[manifest.serverName];
        writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + "\n");
      }

      const settingsPath = join(cwd, ".claude", "settings.json");
      if (existsSync(settingsPath)) {
        const s = JSON.parse(readFileSync(settingsPath, "utf8"));
        if (s.permissions) {
          s.permissions.allow = (s.permissions.allow ?? []).filter(
            (x: string) => x !== `mcp__${manifest.serverName}__*`
          );
          s.permissions.deny = (s.permissions.deny ?? []).filter(
            (x: string) => !NATIVE_TOOLS.includes(x)
          );
        }
        writeFileSync(settingsPath, JSON.stringify(s, null, 2) + "\n");
      }

      rmSync(manifestPath, { force: true });
      console.log(C.green(`✓ Removed outfit ${C.bold(manifest.name)}. Native tools restored.`));
      console.log(C.dim("  Restart Claude Code to pick up the change."));
    },
  },

  status: {
    summary: "Show the outfit currently worn in this project",
    run(p) {
      const manifestPath = join(process.cwd(), ".outfit", "applied.json");
      if (!existsSync(manifestPath)) {
        if (p.values.json) console.log(JSON.stringify({ worn: null }));
        else console.log(C.dim("No outfit is currently worn here."));
        return;
      }
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (p.values.json) {
        console.log(JSON.stringify({ worn: manifest }, null, 2));
        return;
      }
      console.log(`${C.green("●")} Wearing ${C.bold(manifest.name)} ${C.dim(`(${manifest.target})`)}`);
      for (const f of manifest.files as string[]) {
        console.log(C.dim(`    ${relative(process.cwd(), f)}`));
      }
    },
  },

  gateway: {
    summary: "Run the Outfit Gateway (MCP server) for an outfit",
    async run(p) {
      const file = (p.values.outfit as string) ?? die("Usage: outfit gateway --outfit <file>");
      const { outfit } = loadOutfit(file);
      await runGateway(outfit);
    },
  },

  init: {
    summary: "Scaffold a new outfit in ./outfits",
    run(p) {
      const name = p.positionals[0] ?? die("Usage: outfit init <name>");
      if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) die("name must be kebab-case (a-z, 0-9, -).");
      const dir = join(process.cwd(), "outfits");
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${name}.outfit.yaml`);
      if (existsSync(file)) die(`${file} already exists.`);
      writeFileSync(file, scaffold(name));
      console.log(C.green(`✓ Created ${relative(process.cwd(), file)}`));
      console.log(C.dim(`  Edit it, then: outfit doctor ${name} && outfit use ${name}`));
    },
  },

  "install-command": {
    summary: "Install the /outfit slash command into ./.claude/commands",
    run() {
      const dir = join(process.cwd(), ".claude", "commands");
      mkdirSync(dir, { recursive: true });
      const file = join(dir, "outfit.md");
      writeFileSync(file, SLASH_COMMAND);
      console.log(C.green(`✓ Installed /outfit → ${relative(process.cwd(), file)}`));
    },
  },

  targets: {
    summary: "List available compile targets and what they can enforce",
    run() {
      console.log(C.bold("\nTargets:\n"));
      for (const a of Object.values(ADAPTERS)) {
        console.log(`  ${C.cyan(a.id)} — ${a.title}`);
        const c = a.conformance;
        const yn = (b: boolean) => (b ? C.green("yes") : C.dim("no "));
        console.log(
          C.dim(
            `    gateway:${yn(c.routeViaGateway)} deny-native:${yn(c.denyNative)} hooks:${yn(c.hooks)} slash:${yn(c.slashCommands)} integrations:${yn(c.integrations)}`
          )
        );
      }
      console.log();
    },
  },
};

function scaffold(name: string): string {
  return `apiVersion: outfit/v1
name: ${name}
description: Describe what this agent is for.
version: 0.1.0

identity:
  prompt: |
    You are ${name}. Describe the persona, its goals, and how it should behave.

capabilities:
  - id: fs.read
    enforcement: hard
    scope:
      paths: ["**/*"]
  - id: shell.exec
    enforcement: hard
    scope:
      allow: ["ls *", "cat *", "git status"]

skills: []
integrations: []
extensions: {}
`;
}

const SLASH_COMMAND = `---
description: Pick an Outfit (agent persona) to wear in this project
allowed-tools: Bash(outfit *), Bash(npx outfit *)
---

You are helping the user pick and wear an "Outfit" — a portable, enforced agent
persona managed by the \`outfit\` CLI.

Steps:
1. Run \`outfit list --json\` to get the available outfits.
2. Present them as a short numbered list (name — description).
3. Ask the user which one they want to wear (or accept one passed as $ARGUMENTS).
4. Run \`outfit doctor <name>\` to confirm it can be enforced here. Show any issues.
5. If it passes, run \`outfit use <name>\` to wear it.
6. Tell the user to reload so the new tool-world (MCP gateway) takes effect.

If $ARGUMENTS names an outfit directly, skip straight to steps 4–6 for it.
`;

function help(): void {
  console.log(C.bold("\noutfit") + C.dim(` v${VERSION} — portable, enforced agent personas.\n`));
  console.log("Usage: outfit <command> [options]\n");
  console.log(C.bold("Commands:"));
  const width = Math.max(...Object.keys(commands).map((k) => k.length));
  for (const [name, cmd] of Object.entries(commands)) {
    console.log(`  ${C.cyan(name.padEnd(width))}  ${cmd.summary}`);
  }
  console.log();
  console.log(C.bold("Options:"));
  console.log(`  ${C.cyan("-t, --target")}  Compile target (default: claude-code)`);
  console.log(`  ${C.cyan("-o, --out")}     Output directory for compile`);
  console.log(`  ${C.cyan("    --json")}    Machine-readable output where supported`);
  console.log(`  ${C.cyan("    --force")}   Override safety guards`);
  console.log(`  ${C.cyan("-h, --help")}    Show this help`);
  console.log();
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (!argv.length || argv[0] === "help") return help();

  const parsed = parse(argv);
  if (parsed.values.version) return void console.log(VERSION);

  const name = parsed.positionals.shift();
  if (!name || parsed.values.help) return help();

  const cmd = commands[name];
  if (!cmd) {
    die(`Unknown command "${name}". Run \`outfit help\` for usage.`);
  }
  await cmd.run(parsed);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(C.red(`✗ ${msg}`));
  process.exit(1);
});
