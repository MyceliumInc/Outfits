import { z } from "zod";

export const Enforcement = z.enum(["hard", "soft"]);
export type Enforcement = z.infer<typeof Enforcement>;

export const ShellScope = z.object({
  allow: z.array(z.string()).default([]),
  deny: z.array(z.string()).default([]),
  timeoutMs: z.number().int().positive().optional(),
});
export type ShellScope = z.infer<typeof ShellScope>;

export const FsScope = z.object({
  paths: z.array(z.string()).default([]),
});
export type FsScope = z.infer<typeof FsScope>;

export const NetScope = z.object({
  domains: z.array(z.string()).default([]),
});
export type NetScope = z.infer<typeof NetScope>;

export const Scope = z.record(z.unknown());
export type Scope = z.infer<typeof Scope>;

export const Capability = z.object({
  id: z.string(),
  scope: Scope.default({}),
});
export type Capability = z.infer<typeof Capability>;

export const Skill = z.object({
  id: z.string(),
  source: z.string().optional(),
  inline: z.string().optional(),
  description: z.string().optional(),
});
export type Skill = z.infer<typeof Skill>;

export const Integration = z.object({
  id: z.string(),
  kind: z.literal("mcp").default("mcp"),
  enforcement: Enforcement.default("hard"),
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  allowTools: z.array(z.string()).default([]),
  install: z.string().optional(),
});
export type Integration = z.infer<typeof Integration>;

export const Identity = z.object({
  prompt: z.string(),
  model: z.string().optional(),
});
export type Identity = z.infer<typeof Identity>;

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
  extensions: z.record(z.unknown()).default({}),
});
export type Outfit = z.infer<typeof Outfit>;
