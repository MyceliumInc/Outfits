import type { Outfit } from "../spec/index.js";

export interface Conformance {
  routeViaGateway: boolean;
  denyNative: boolean;
  hooks: boolean;
  slashCommands: boolean;
  integrations: boolean;
}

export interface CompileResult {
  files: string[];
  notes: string[];
}

export interface Adapter {
  id: string;
  title: string;
  conformance: Conformance;
  compile(outfit: Outfit, outfitPath: string, outDir: string): Promise<CompileResult>;
}
