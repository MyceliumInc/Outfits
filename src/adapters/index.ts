import type { Adapter } from "./types.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { openaiAgentsAdapter } from "./openai-agents.js";

export * from "./types.js";

export const ADAPTERS: Record<string, Adapter> = {
  [claudeCodeAdapter.id]: claudeCodeAdapter,
  [openaiAgentsAdapter.id]: openaiAgentsAdapter,
};

export function getAdapter(id: string): Adapter {
  const adapter = ADAPTERS[id];
  if (!adapter) {
    throw new Error(
      `Unknown target "${id}". Available: ${Object.keys(ADAPTERS).join(", ")}`
    );
  }
  return adapter;
}
