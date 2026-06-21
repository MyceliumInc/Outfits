import type { Outfit } from "../spec/index.js";

/**
 * What an adapter can actually enforce in its runtime. This is the honest core
 * of "enforced + portable": if an outfit hard-requires something an adapter
 * cannot guarantee, `outfit doctor` fails for that target.
 */
export interface Conformance {
  /** Can route all tools through the gateway (the agent's sole tool-world). */
  routeViaGateway: boolean;
  /** Can disable the runtime's native built-in tools. */
  denyNative: boolean;
  /** Supports lifecycle hooks (extensions.<target>.hooks). */
  hooks: boolean;
  /** Supports user-invoked slash commands. */
  slashCommands: boolean;
  /** Can proxy raw MCP integrations. */
  integrations: boolean;
}

export interface CompileResult {
  /** Absolute paths written. */
  files: string[];
  /** Human-facing notes (e.g. follow-up steps). */
  notes: string[];
}

export interface Adapter {
  id: string;
  title: string;
  conformance: Conformance;
  /** Emit runtime config for this outfit into `outDir`. */
  compile(outfit: Outfit, outfitPath: string, outDir: string): Promise<CompileResult>;
}
