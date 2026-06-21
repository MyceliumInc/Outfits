import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { parse as parseYaml } from "yaml";
import { Outfit } from "./schema.js";
import { ONTOLOGY, isKnownCapability } from "./ontology.js";

export * from "./schema.js";
export * from "./ontology.js";

export interface LoadedOutfit {
  outfit: Outfit;
  path: string;
}

export interface ValidationIssue {
  level: "error" | "warning";
  message: string;
}

export function loadOutfit(path: string): LoadedOutfit {
  const abs = resolve(path);
  if (!existsSync(abs)) throw new Error(`Outfit file not found: ${abs}`);
  const raw = readFileSync(abs, "utf8");
  const data = abs.endsWith(".json") ? JSON.parse(raw) : parseYaml(raw);
  const parsed = Outfit.safeParse(data);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid outfit spec (${basename(abs)}):\n${details}`);
  }
  return { outfit: parsed.data, path: abs };
}

export function validateSemantics(outfit: Outfit): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const cap of outfit.capabilities) {
    if (!isKnownCapability(cap.id)) {
      issues.push({
        level: "error",
        message: `Unknown capability "${cap.id}". Not in the ontology - use an integration instead, or add it to the ontology.`,
      });
      continue;
    }
    const def = ONTOLOGY[cap.id];
    if (def.scope === "shell" && cap.scope && !("allow" in cap.scope)) {
      issues.push({
        level: "warning",
        message: `Capability "${cap.id}" has no "allow" list - every command will be denied.`,
      });
    }
    if (def.scope === "fs" && cap.scope && !("paths" in cap.scope)) {
      issues.push({
        level: "warning",
        message: `Capability "${cap.id}" has no "paths" list - every path will be denied.`,
      });
    }
    if (def.scope === "net" && cap.scope && !("domains" in cap.scope)) {
      issues.push({
        level: "warning",
        message: `Capability "${cap.id}" has no "domains" list - every request will be denied.`,
      });
    }
  }

  for (const integ of outfit.integrations) {
    if (!integ.command) {
      issues.push({
        level: "error",
        message: `Integration "${integ.id}" has no "command" to launch its MCP server.`,
      });
    }
  }

  if (outfit.integrations.length > 0) {
    issues.push({
      level: "warning",
      message: `This outfit uses ${outfit.integrations.length} raw integration(s). Integrations are not portable across runtimes.`,
    });
  }

  return issues;
}

export function searchPaths(): string[] {
  const paths = [
    resolve(process.cwd(), "outfits"),
    join(homedir(), ".outfit", "outfits"),
  ];
  try {
    paths.push(fileURLToPath(new URL("../../examples", import.meta.url)));
  } catch {}
  return paths;
}

const OUTFIT_FILE = /\.outfit\.(ya?ml|json)$/;

export function discoverOutfits(): LoadedOutfit[] {
  const seen = new Set<string>();
  const found: LoadedOutfit[] = [];
  for (const dir of searchPaths()) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      if (!OUTFIT_FILE.test(entry)) continue;
      try {
        const loaded = loadOutfit(join(dir, entry));
        if (seen.has(loaded.outfit.name)) continue;
        seen.add(loaded.outfit.name);
        found.push(loaded);
      } catch {}
    }
  }
  return found;
}

export function resolveOutfit(nameOrPath: string): LoadedOutfit {
  if (OUTFIT_FILE.test(nameOrPath) || nameOrPath.includes("/") || nameOrPath.includes("\\")) {
    return loadOutfit(nameOrPath);
  }
  const match = discoverOutfits().find((o) => o.outfit.name === nameOrPath);
  if (!match) throw new Error(`No outfit named "${nameOrPath}" found in search paths.`);
  return match;
}
