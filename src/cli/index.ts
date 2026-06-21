#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { Command } from "commander";
import {
  loadOutfit,
  resolveOutfit,
  discoverOutfits,
  validateSemantics,
  ONTOLOGY,
} from "../spec/index.js";
import { getAdapter, ADAPTERS } from "../adapters/index.js";
import { NATIVE_TOOLS } from "../adapters/claude-code.js";
import { runGateway } from "../gateway/index.js";
import { doctor } from "./doctor.js";

const program = new Command();

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

function die(msg: string): never {
  console.error(C.red(`✗ ${msg}`));
  process.exit(1);
}

program
  .name("outfit")
  .description("Portable, enforced agent personas. One spec — any runtime.")
  .version("0.1.0");

// ── list ──────────────────────────────────────────────────────────────────
program
  .command("list")
  .description("List available outfits across search paths")
  .option("--json", "output JSON")
  .action((opts) => {
    const found = discoverOutfits();
    if (opts.json) {
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
  });

// ── validate ────────────────────────────────────────────────────────────────
program
  .command("validate <fileOrName>")
  .description("Validate an outfit against the schema and ontology")
  .action((fileOrName) => {
    const { outfit } = resolveOutfit(fileOrName);
    const issues = validateSemantics(outfit);
    if (!issues.length) {
      console.log(C.green(`✓ ${outfit.name} is valid.`));
      return;
    }
    for (const i of issues) {
      const tag = i.level === "error" ? C.red("error") : C.yellow("warn");
      console.log(`  ${tag}  ${i.message}`);
    }
    if (issues.some((i) => i.level === "error")) process.exit(1);
  });

// ── doctor ──────────────────────────────────────────────────────────────────
program
  .command("doctor <fileOrName>")
  .description("Preflight: can the target runtime enforce this outfit?")
  .option("-t, --target <id>", "target adapter", "claude-code")
  .action((fileOrName, opts) => {
    const { outfit } = resolveOutfit(fileOrName);
    const report = doctor(outfit, opts.target);
    const adapter = getAdapter(opts.target);
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
      for (const i of report.issues) {
        const tag = i.level === "error" ? C.red("  error") : C.yellow("  warn ");
        console.log(`${tag}  ${i.message}`);
      }
    }
    console.log();
    if (report.ok) {
      console.log(C.green(`✓ ${adapter.title} can enforce this outfit.\n`));
    } else {
      console.log(C.red(`✗ ${adapter.title} cannot enforce this outfit as specified.\n`));
      process.exit(1);
    }
  });

// ── compile ───────────────────────────────────────────────────────────────
program
  .command("compile <fileOrName>")
  .description("Compile an outfit into runtime config")
  .option("-t, --target <id>", "target adapter", "claude-code")
  .option("-o, --out <dir>", "output directory", ".")
  .action(async (fileOrName, opts) => {
    const { outfit, path } = resolveOutfit(fileOrName);
    const report = doctor(outfit, opts.target);
    if (!report.ok) {
      for (const i of report.issues.filter((x) => x.level === "error")) {
        console.error(C.red(`  error  ${i.message}`));
      }
      die(`Cannot compile: ${getAdapter(opts.target).title} cannot enforce this outfit.`);
    }
    const adapter = getAdapter(opts.target);
    const result = await adapter.compile(outfit, path, resolve(opts.out));
    console.log(C.green(`✓ Compiled ${outfit.name} → ${adapter.title}`));
    for (const f of result.files) console.log(C.dim(`  + ${relative(process.cwd(), f)}`));
    for (const n of result.notes) console.log(C.dim(`  ℹ ${n}`));
  });

// ── use / doff ──────────────────────────────────────────────────────────────
program
  .command("use <fileOrName>")
  .description("Wear an outfit in the current project (Claude Code)")
  .option("-t, --target <id>", "target adapter", "claude-code")
  .action(async (fileOrName, opts) => {
    const { outfit, path } = resolveOutfit(fileOrName);
    const report = doctor(outfit, opts.target);
    if (!report.ok) {
      for (const i of report.issues.filter((x) => x.level === "error")) {
        console.error(C.red(`  error  ${i.message}`));
      }
      die("Cannot wear this outfit — see errors above.");
    }
    const adapter = getAdapter(opts.target);
    const result = await adapter.compile(outfit, path, process.cwd());

    mkdirSync(join(process.cwd(), ".outfit"), { recursive: true });
    writeFileSync(
      join(process.cwd(), ".outfit", "applied.json"),
      JSON.stringify(
        { name: outfit.name, target: opts.target, serverName: `outfit-${outfit.name}`, files: result.files },
        null,
        2
      )
    );
    console.log(C.green(`✓ Now wearing ${C.bold(outfit.name)} (${adapter.title}).`));
    for (const n of result.notes) console.log(C.dim(`  ℹ ${n}`));
    console.log(C.dim("  Restart Claude Code (or reload) to pick up the new tool-world."));
  });

program
  .command("doff")
  .description("Remove the currently worn outfit from this project")
  .action(() => {
    const manifestPath = join(process.cwd(), ".outfit", "applied.json");
    if (!existsSync(manifestPath)) die("No outfit is currently worn here.");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    // Remove generated agent/skill/script files (but not shared config files).
    for (const f of manifest.files as string[]) {
      if (f.endsWith(".mcp.json") || f.endsWith("settings.json")) continue;
      try { rmSync(f, { force: true }); } catch { /* ignore */ }
    }
    // Un-register the gateway and restore permissions.
    const mcpPath = join(process.cwd(), ".mcp.json");
    if (existsSync(mcpPath)) {
      const mcp = JSON.parse(readFileSync(mcpPath, "utf8"));
      if (mcp.mcpServers) delete mcp.mcpServers[manifest.serverName];
      writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + "\n");
    }
    const settingsPath = join(process.cwd(), ".claude", "settings.json");
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
  });

// ── gateway ───────────────────────────────────────────────────────────────
program
  .command("gateway")
  .description("Run the Outfit Gateway (MCP server) for an outfit")
  .requiredOption("--outfit <file>", "path to the outfit file")
  .action(async (opts) => {
    const { outfit } = loadOutfit(opts.outfit);
    await runGateway(outfit);
  });

// ── init ────────────────────────────────────────────────────────────────────
program
  .command("init <name>")
  .description("Scaffold a new outfit in ./outfits")
  .action((name) => {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) die("name must be kebab-case (a-z, 0-9, -).");
    const dir = join(process.cwd(), "outfits");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${name}.outfit.yaml`);
    if (existsSync(file)) die(`${file} already exists.`);
    writeFileSync(
      file,
      `apiVersion: outfit/v1
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
`
    );
    console.log(C.green(`✓ Created ${relative(process.cwd(), file)}`));
    console.log(C.dim(`  Edit it, then: outfit doctor ${name} && outfit use ${name}`));
  });

// ── install-command (the /outfit picker) ──────────────────────────────────
program
  .command("install-command")
  .description("Install the /outfit slash command into ./.claude/commands")
  .action(() => {
    const dir = join(process.cwd(), ".claude", "commands");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "outfit.md");
    writeFileSync(file, SLASH_COMMAND);
    console.log(C.green(`✓ Installed /outfit → ${relative(process.cwd(), file)}`));
  });

// ── targets ───────────────────────────────────────────────────────────────
program
  .command("targets")
  .description("List available compile targets and what they can enforce")
  .action(() => {
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
  });

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

program.parseAsync(process.argv);
