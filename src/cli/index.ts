#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, renameSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  loadOutfit,
  resolveOutfit,
  discoverOutfits,
  validateSemantics,
  ONTOLOGY,
  type ValidationIssue,
} from "../spec/index.js";
import { getAdapter, ADAPTERS } from "../adapters/index.js";
import { personaMarkers, removeBlock } from "../adapters/claude-code.js";
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
  try {
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
  } catch (err) {
    const detail = err instanceof Error ? err.message.split(".")[0] : String(err);
    throw new CliError(`${detail}. Run \`outfit help\` for usage.`);
  }
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
        if ((pkg.name === "@myceliuminc/outfit" || pkg.name === "outfit") && pkg.bin?.outfit) return true;
      } catch {}
    }
    const parent = dirname(cur);
    if (parent === cur) return false;
    cur = parent;
  }
}

function printIssues(issues: ValidationIssue[]): void {
  for (const i of issues) {
    const tag = i.level === "error" ? C.red("error") : C.yellow("warn ");
    console.log(`  ${tag}  ${i.message}`);
  }
}

function readTemplate(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../templates/${name}`, import.meta.url)), "utf8");
}

const RAW_BASE = "https://raw.githubusercontent.com/MyceliumInc/Outfits/HEAD/";
const REGISTRY_URL = RAW_BASE + "registry/index.json";
const MARKET_BASE = "https://outfits.mycelium.markets";

function userOutfitsDir(): string {
  return join(homedir(), ".outfit", "outfits");
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
  return res.text();
}

async function resolveRef(ref: string): Promise<string> {
  if (/^https?:\/\//.test(ref)) return ref;
  const gh = ref.match(/^github:([^/]+)\/([^/]+)\/(.+)$/);
  if (gh) return `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/HEAD/${gh[3]}`;
  try {
    const index = JSON.parse(await fetchText(REGISTRY_URL));
    const entry = (index.outfits ?? []).find((o: any) => o.name === ref);
    if (entry) return /^https?:\/\//.test(entry.source) ? entry.source : RAW_BASE + entry.source;
  } catch {}
  return `${MARKET_BASE}/api/outfit/${encodeURIComponent(ref)}`;
}

async function addOutfit(ref: string): Promise<{ name: string; dest: string }> {
  const text = await fetchText(await resolveRef(ref));
  const dir = userOutfitsDir();
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, ".incoming.outfit.yaml");
  writeFileSync(tmp, text);
  let loaded;
  try {
    loaded = loadOutfit(tmp);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
  const errors = validateSemantics(loaded.outfit).filter((i) => i.level === "error");
  if (errors.length) {
    rmSync(tmp, { force: true });
    printIssues(errors);
    die("Refusing to add an invalid outfit.");
  }
  const dest = join(dir, `${loaded.outfit.name}.outfit.yaml`);
  rmSync(dest, { force: true });
  renameSync(tmp, dest);
  return { name: loaded.outfit.name, dest };
}

function pruneDirIfEmpty(dir: string): void {
  try {
    if (existsSync(dir) && readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true });
  } catch {}
}

function readJsonFile(path: string): any {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

function snapshotState(cwd: string): {
  created: { mcp: boolean; settings: boolean };
  prevDeny: string[];
  prevAllow: string[];
  settingsKnown: boolean;
} {
  const mcpPath = join(cwd, ".mcp.json");
  const settingsPath = join(cwd, ".claude", "settings.json");
  const hadSettings = existsSync(settingsPath);
  let prevDeny: string[] = [];
  let prevAllow: string[] = [];
  let settingsKnown = !hadSettings;
  if (hadSettings) {
    const s = readJsonFile(settingsPath);
    if (s) {
      prevDeny = s.permissions?.deny ?? [];
      prevAllow = s.permissions?.allow ?? [];
      settingsKnown = true;
    }
  }
  return {
    created: { mcp: !existsSync(mcpPath), settings: !hadSettings },
    prevDeny,
    prevAllow,
    settingsKnown,
  };
}

function removeWorn(cwd: string): string | null {
  const manifestPath = join(cwd, ".outfit", "applied.json");
  if (!existsSync(manifestPath)) return null;
  const manifest = readJsonFile(manifestPath);
  if (!manifest) {
    rmSync(manifestPath, { force: true });
    return null;
  }
  const files: string[] = manifest.files ?? [];

  const mcpPath = join(cwd, ".mcp.json");
  const settingsPath = join(cwd, ".claude", "settings.json");

  for (const f of files) {
    if (f.endsWith(".mcp.json") || f.endsWith("settings.json")) continue;
    if (f.endsWith("CLAUDE.md")) {
      if (!existsSync(f)) continue;
      const stripped = removeBlock(readFileSync(f, "utf8"), personaMarkers(manifest.name));
      if (stripped.trim()) writeFileSync(f, stripped);
      else rmSync(f, { force: true });
      continue;
    }
    try { rmSync(f, { force: true }); } catch {}
    pruneDirIfEmpty(dirname(f));
  }
  pruneDirIfEmpty(join(cwd, ".claude", "skills"));

  if (existsSync(mcpPath)) {
    const mcp = readJsonFile(mcpPath) ?? {};
    if (mcp.mcpServers) delete mcp.mcpServers[manifest.serverName];
    const empty = !mcp.mcpServers || Object.keys(mcp.mcpServers).length === 0;
    if (empty && manifest.created?.mcp) rmSync(mcpPath, { force: true });
    else writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + "\n");
  }

  if (existsSync(settingsPath)) {
    if (manifest.created?.settings) {
      rmSync(settingsPath, { force: true });
    } else if (manifest.settingsKnown !== false) {
      const s = readJsonFile(settingsPath);
      if (s) {
        s.permissions = s.permissions ?? {};
        s.permissions.deny = manifest.prevDeny ?? [];
        s.permissions.allow = manifest.prevAllow ?? [];
        writeFileSync(settingsPath, JSON.stringify(s, null, 2) + "\n");
      }
    }
  }

  rmSync(manifestPath, { force: true });
  pruneDirIfEmpty(join(cwd, ".outfit"));
  pruneDirIfEmpty(join(cwd, ".claude"));
  return manifest.name;
}

interface Command {
  summary: string;
  usage?: string;
  run: (p: Parsed) => Promise<void> | void;
}

const commands: Record<string, Command> = {
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

  add: {
    summary: "Fetch and install an outfit from a URL, github ref, the registry, or the marketplace",
    usage: "outfit add <url | github:user/repo/path | name>",
    async run(p) {
      const ref = p.positionals[0] ?? die("Usage: outfit add <url | github:user/repo/path | name>");
      const { name, dest } = await addOutfit(ref);
      console.log(C.green(`✓ Added ${C.bold(name)}`));
      console.log(C.dim(`  ${dest}`));
      console.log(C.dim(`  Wear it with: outfit use ${name}`));
    },
  },

  remove: {
    summary: "Remove an installed outfit from ~/.outfit/outfits",
    usage: "outfit remove <name>",
    run(p) {
      const name = p.positionals[0] ?? die("Usage: outfit remove <name>");
      const file = join(userOutfitsDir(), `${name}.outfit.yaml`);
      if (!existsSync(file)) die(`No installed outfit named "${name}".`);
      rmSync(file, { force: true });
      console.log(C.green(`✓ Removed ${name}`));
    },
  },

  validate: {
    summary: "Validate an outfit against the schema and ontology",
    usage: "outfit validate <fileOrName> [--json]",
    run(p) {
      const ref = p.positionals[0] ?? die("Usage: outfit validate <fileOrName>");
      const { outfit } = resolveOutfit(ref);
      const issues = validateSemantics(outfit);
      const hasError = issues.some((i) => i.level === "error");
      if (p.values.json) {
        console.log(JSON.stringify({ outfit: outfit.name, ok: !hasError, issues }, null, 2));
        if (hasError) process.exitCode = 1;
        return;
      }
      if (!issues.length) {
        console.log(C.green(`✓ ${outfit.name} is valid.`));
        return;
      }
      printIssues(issues);
      if (hasError) process.exitCode = 1;
    },
  },

  doctor: {
    summary: "Preflight: can the target runtime enforce this outfit?",
    usage: "outfit doctor <fileOrName> [-t target] [--json]",
    run(p) {
      const ref = p.positionals[0] ?? die("Usage: outfit doctor <fileOrName> [-t target]");
      const { outfit } = resolveOutfit(ref);
      const report = doctor(outfit, target(p));
      const adapter = getAdapter(target(p));
      if (p.values.json) {
        console.log(
          JSON.stringify(
            { outfit: outfit.name, target: target(p), ok: report.ok, issues: report.issues },
            null,
            2
          )
        );
        if (!report.ok) process.exitCode = 1;
        return;
      }
      console.log(C.bold(`\nDoctor: ${outfit.name} → ${adapter.title}\n`));

      console.log(C.dim("  Capabilities:"));
      for (const cap of outfit.capabilities) {
        const known = ONTOLOGY[cap.id];
        const mark = known ? C.green("✓") : C.red("✗");
        console.log(`    ${mark} ${cap.id}`);
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
    usage: "outfit compile <fileOrName> [-t target] [-o dir]",
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
      for (const f of result.files) {
        const rel = relative(process.cwd(), f);
        console.log(C.dim(`  + ${rel.startsWith("..") ? f : rel}`));
      }
      for (const n of result.notes) console.log(C.dim(`  ℹ ${n}`));
    },
  },

  use: {
    summary: "Wear an outfit in the current project (Claude Code)",
    usage: "outfit use <fileOrName> [-t target] [--force]",
    async run(p) {
      const ref = p.positionals[0] ?? die("Usage: outfit use <fileOrName> [-t target] [--force]");
      const cwd = process.cwd();
      if (isOutfitDevRepo(cwd) && !p.values.force) {
        die(
          "Refusing to wear an outfit inside the outfit source repo - it would deny the\n" +
            "  native tools you need to develop here, locking this session until `outfit doff`.\n" +
            "  Wear it in a separate project, or pass --force if you really mean to."
        );
      }
      const { outfit, path } = resolveOutfit(ref);
      const report = doctor(outfit, target(p));
      if (!report.ok) {
        printIssues(report.issues.filter((x) => x.level === "error"));
        die("Cannot wear this outfit - see errors above.");
      }
      const previous = removeWorn(cwd);
      const snapshot = snapshotState(cwd);
      const adapter = getAdapter(target(p));
      const manifestPath = join(cwd, ".outfit", "applied.json");
      const manifest: Record<string, unknown> = {
        name: outfit.name,
        target: target(p),
        serverName: `outfit-${outfit.name}`,
        files: [],
        created: snapshot.created,
        prevDeny: snapshot.prevDeny,
        prevAllow: snapshot.prevAllow,
        settingsKnown: snapshot.settingsKnown,
      };
      const writeManifest = () => {
        mkdirSync(join(cwd, ".outfit"), { recursive: true });
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
      };
      writeManifest();
      const result = await adapter.compile(outfit, path, cwd);
      manifest.files = result.files;
      writeManifest();
      if (previous && previous !== outfit.name) {
        console.log(C.dim(`  Replaced previously worn outfit ${previous}.`));
      }
      console.log(C.green(`✓ Now wearing ${C.bold(outfit.name)} (${adapter.title}).`));
      for (const n of result.notes) console.log(C.dim(`  ℹ ${n}`));
      console.log(C.yellow("  Native tools are denied until you restart - reload Claude Code now."));
      console.log(C.dim("  Take it off any time with `outfit doff`."));
    },
  },

  doff: {
    summary: "Remove the currently worn outfit from this project",
    run() {
      const removed = removeWorn(process.cwd());
      if (!removed) die("No outfit is currently worn here.");
      console.log(C.green(`✓ Removed outfit ${C.bold(removed)}. Native tools restored.`));
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
    usage: "outfit gateway --outfit <file>",
    async run(p) {
      const file = (p.values.outfit as string) ?? die("Usage: outfit gateway --outfit <file>");
      const { outfit } = loadOutfit(file);
      await runGateway(outfit);
    },
  },

  init: {
    summary: "Scaffold a new outfit in ./outfits",
    usage: "outfit init <name>",
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
      writeFileSync(file, readTemplate("outfit-picker.command.md"));
      console.log(C.green(`✓ Installed /outfit → ${relative(process.cwd(), file)}`));
    },
  },

  "install-skill": {
    summary: "Install the create-outfit skill into ./.claude/skills",
    run() {
      const dir = join(process.cwd(), ".claude", "skills", "create-outfit");
      mkdirSync(dir, { recursive: true });
      const file = join(dir, "SKILL.md");
      writeFileSync(file, readTemplate("create-outfit.skill.md"));
      console.log(C.green(`✓ Installed create-outfit skill → ${relative(process.cwd(), file)}`));
      console.log(C.dim("  In Claude Code, ask it to \"make an outfit\" and the skill takes over."));
    },
  },

  targets: {
    summary: "List available compile targets and what they can enforce",
    run(p) {
      if (p.values.json) {
        console.log(
          JSON.stringify(
            Object.values(ADAPTERS).map((a) => ({ id: a.id, title: a.title, conformance: a.conformance })),
            null,
            2
          )
        );
        return;
      }
      console.log(C.bold("\nTargets:\n"));
      for (const a of Object.values(ADAPTERS)) {
        const tag = a.experimental ? C.yellow(" (experimental)") : "";
        console.log(`  ${C.cyan(a.id)} - ${a.title}${tag}`);
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
  return `# yaml-language-server: $schema=https://raw.githubusercontent.com/MyceliumInc/Outfits/HEAD/schema/outfit.schema.json
apiVersion: outfit/v1
name: ${name}
description: Describe what this agent is for.
version: 0.1.0

identity:
  prompt: |
    You are ${name}. Describe the persona, its goals, and how it should behave.

capabilities:
  - id: fs.read
    scope:
      paths: ["**/*"]
  - id: shell.exec
    scope:
      allow: ["ls *", "cat *", "git status"]
      deny: ["git push*"]

skills: []
integrations: []
extensions: {}
`;
}

function commandHelp(name: string, cmd: Command): void {
  console.log(`\n${C.bold("outfit " + name)} - ${cmd.summary}`);
  console.log(`\nUsage: ${cmd.usage ?? `outfit ${name}`}`);
  console.log();
}

function help(): void {
  console.log(C.bold("\noutfit") + C.dim(` v${VERSION} - portable, enforced agent personas.\n`));
  console.log("Usage: outfit <command> [options]\n");
  console.log(C.bold("Commands:"));
  const width = Math.max(...Object.keys(commands).map((k) => k.length));
  for (const [name, cmd] of Object.entries(commands)) {
    console.log(`  ${C.cyan(name.padEnd(width))}  ${cmd.summary}`);
  }
  console.log();
  console.log(C.bold("Options:"));
  console.log(`  ${C.cyan("-t, --target")}   Compile target (default: claude-code)`);
  console.log(`  ${C.cyan("-o, --out")}      Output directory for compile`);
  console.log(`  ${C.cyan("    --outfit")}   Outfit file for the gateway command`);
  console.log(`  ${C.cyan("    --json")}     Machine-readable output where supported`);
  console.log(`  ${C.cyan("    --force")}    Override safety guards`);
  console.log(`  ${C.cyan("-h, --help")}     Show this help`);
  console.log(`  ${C.cyan("-v, --version")}  Print the version`);
  console.log();
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (!argv.length || argv[0] === "help") return help();

  const parsed = parse(argv);
  const name = parsed.positionals.shift();
  if (!name) {
    if (parsed.values.version) return void console.log(VERSION);
    return help();
  }
  const cmd = commands[name];
  if (!cmd) {
    die(`Unknown command "${name}". Run \`outfit help\` for usage.`);
  }
  if (parsed.values.help) return commandHelp(name, cmd);
  await cmd.run(parsed);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(C.red(`✗ ${msg}`));
  process.exit(1);
});
