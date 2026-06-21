import { exec } from "node:child_process";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import {
  assertShellAllowed,
  assertPathAllowed,
  assertUrlAllowed,
} from "./scope.js";

const execAsync = promisify(exec);

/**
 * The gateway's own implementations of the ontology capabilities. This is what
 * makes the capabilities portable AND enforced: the gateway *is* the tool, and
 * it checks scope before doing anything.
 */

export type CapabilityHandler = (
  args: Record<string, any>,
  scope: Record<string, any>
) => Promise<string>;

const MAX_OUTPUT = 100_000;

function truncate(s: string): string {
  return s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + "\n…[truncated]" : s;
}

export const HANDLERS: Record<string, CapabilityHandler> = {
  "shell.exec": async (args, scope) => {
    const command = String(args.command ?? "");
    assertShellAllowed(command, scope);
    const timeout = Number(scope.timeoutMs) || 120_000;
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        cwd: process.cwd(),
      });
      return truncate([stdout, stderr].filter(Boolean).join("\n").trim() || "(no output)");
    } catch (err: any) {
      const out = [err.stdout, err.stderr].filter(Boolean).join("\n");
      return truncate(`Command failed (exit ${err.code ?? "?"}):\n${out || err.message}`);
    }
  },

  "fs.read": async (args, scope) => {
    const abs = assertPathAllowed(String(args.path ?? ""), scope);
    return truncate(await readFile(abs, "utf8"));
  },

  "fs.write": async (args, scope) => {
    const abs = assertPathAllowed(String(args.path ?? ""), scope);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, String(args.content ?? ""), "utf8");
    return `Wrote ${Buffer.byteLength(String(args.content ?? ""))} bytes to ${abs}`;
  },

  "fs.list": async (args, scope) => {
    const abs = assertPathAllowed(String(args.path ?? ""), scope);
    const entries = await readdir(abs, { withFileTypes: true });
    return entries
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .join("\n") || "(empty)";
  },

  "http.fetch": async (args, scope) => {
    const url = assertUrlAllowed(String(args.url ?? ""), scope);
    const res = await fetch(url, {
      method: args.method ?? "GET",
      headers: args.headers ?? undefined,
      body: args.body ?? undefined,
    });
    const text = await res.text();
    return truncate(`HTTP ${res.status} ${res.statusText}\n\n${text}`);
  },

  "web.search": async (args, scope) => {
    const query = String(args.query ?? "");
    const count = Number(args.count) || 5;
    const provider = process.env.OUTFIT_SEARCH_PROVIDER;
    const key = process.env.OUTFIT_SEARCH_API_KEY;
    if (!provider || !key) {
      throw new Error(
        "web.search is not configured. Set OUTFIT_SEARCH_PROVIDER (e.g. 'tavily') and OUTFIT_SEARCH_API_KEY."
      );
    }
    if (provider === "tavily") {
      // Tavily is reachable regardless of the net scope (it's the provider, not
      // an agent-chosen destination), but we still respect an explicit domain list.
      assertUrlAllowed("https://api.tavily.com/search", { domains: ["api.tavily.com", ...(scope.domains ?? [])] });
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ api_key: key, query, max_results: count }),
      });
      const data: any = await res.json();
      const results = (data.results ?? [])
        .map((r: any, i: number) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content}`)
        .join("\n\n");
      return truncate(results || "(no results)");
    }
    throw new Error(`Unknown search provider: ${provider}`);
  },
};
