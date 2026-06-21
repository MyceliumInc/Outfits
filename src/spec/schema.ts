import { z } from "zod";

/**
 * The Outfit spec — a portable, declarative description of an agent persona.
 *
 * Layers:
 *   identity      — who the agent is (prompt, optional model).
 *   capabilities  — the PORTABLE core. Abstract verbs from the ontology, each
 *                   with an enforcement level and a scope. The gateway implements
 *                   and enforces these identically on every runtime.
 *   skills        — instruction bundles. Compile to native skills where supported,
 *                   otherwise inline into the prompt.
 *   integrations  — the escape hatch. Raw MCP servers, gated by the contract but
 *                   explicitly non-portable.
 *   extensions    — runtime-specific extras (hooks, slash commands). Capability-
 *                   gated: only applied where the adapter supports them.
 */

export const Enforcement = z.enum(["hard", "soft"]);
export type Enforcement = z.infer<typeof Enforcement>;

/** Scope for shell.exec — command patterns matched with glob semantics. */
export const ShellScope = z.object({
  allow: z.array(z.string()).default([]),
  deny: z.array(z.string()).default([]),
  timeoutMs: z.number().int().positive().optional(),
});

/** Scope for fs.* — path globs. */
export const FsScope = z.object({
  paths: z.array(z.string()).default([]),
});

/** Scope for net capabilities — domain globs. */
export const NetScope = z.object({
  domains: z.array(z.string()).default([]),
});

export const Capability = z.object({
  id: z.string(),
  enforcement: Enforcement.default("hard"),
  /** Shape depends on the capability's scope kind; validated against the ontology. */
  scope: z.record(z.any()).default({}),
});
export type Capability = z.infer<typeof Capability>;

export const Skill = z.object({
  id: z.string(),
  /** A source ref (e.g. "github:user/repo") to fetch the skill from. */
  source: z.string().optional(),
  /** Inline skill instructions (Markdown). */
  inline: z.string().optional(),
  description: z.string().optional(),
});
export type Skill = z.infer<typeof Skill>;

export const Integration = z.object({
  id: z.string(),
  kind: z.literal("mcp").default("mcp"),
  enforcement: Enforcement.default("hard"),
  /** Command + args to launch the MCP server the gateway will proxy. */
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  /** Which of the upstream server's tools to expose. Empty = all. */
  allowTools: z.array(z.string()).default([]),
  /** Human-facing install hint surfaced by `outfit doctor`. */
  install: z.string().optional(),
});
export type Integration = z.infer<typeof Integration>;

export const Identity = z.object({
  prompt: z.string(),
  model: z.string().optional(),
});

export const Outfit = z.object({
  apiVersion: z.literal("outfit/v1"),
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "name must be kebab-case"),
  description: z.string().optional(),
  version: z.string().default("0.0.0"),
  author: z.string().optional(),
  identity: Identity,
  capabilities: z.array(Capability).default([]),
  skills: z.array(Skill).default([]),
  integrations: z.array(Integration).default([]),
  extensions: z.record(z.any()).default({}),
});
export type Outfit = z.infer<typeof Outfit>;
