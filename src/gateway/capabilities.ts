import { exec } from "node:child_process";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import {
  assertShellAllowed,
  assertPathAllowed,
  assertUrlAllowed,
  normalizeCommand,
} from "./scope.js";

const execAsync = promisify(exec);

export type CapabilityHandler = (
  args: Record<string, unknown>,
  scope: Record<string, unknown>
) => Promise<string>;

const MAX_OUTPUT = 100_000;
const MAX_REDIRECTS = 5;
const SAFE_ENV = new Set([
  "PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LANGUAGE",
  "TERM", "TMPDIR", "TMP", "TEMP", "TZ", "PWD", "SYSTEMROOT",
]);

function truncate(s: string): string {
  return s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + "\n…[truncated]" : s;
}

export function sanitizedEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (SAFE_ENV.has(k) || k.startsWith("LC_")) env[k] = v;
  }
  return { ...env, ...extra };
}

export const HANDLERS: Record<string, CapabilityHandler> = {
  "shell.exec": async (args, scope) => {
    const command = normalizeCommand(String(args.command ?? ""));
    assertShellAllowed(command, scope);
    const timeout = Number(scope.timeoutMs) || 120_000;
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        cwd: process.cwd(),
        env: sanitizedEnv(),
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
    const content = String(args.content ?? "");
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
    return `Wrote ${Buffer.byteLength(content)} bytes to ${abs}`;
  },

  "fs.list": async (args, scope) => {
    const abs = assertPathAllowed(String(args.path ?? ""), scope);
    const entries = await readdir(abs, { withFileTypes: true });
    return entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name)).join("\n") || "(empty)";
  },

  "http.fetch": async (args, scope) => {
    let current = assertUrlAllowed(String(args.url ?? ""), scope);
    const method = typeof args.method === "string" ? args.method : "GET";
    const headers = (args.headers as Record<string, string> | undefined) ?? undefined;
    const body = typeof args.body === "string" ? args.body : undefined;
    let res: Response;
    let hops = 0;
    while (true) {
      res = await fetch(current, { method, headers, body, redirect: "manual" });
      const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!location) break;
      await res.body?.cancel();
      if (++hops > MAX_REDIRECTS) throw new Error(`Exceeded ${MAX_REDIRECTS} redirects.`);
      current = assertUrlAllowed(new URL(location, current).toString(), scope);
    }
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
      const allowedDomains = Array.isArray(scope.domains) ? (scope.domains as string[]) : [];
      assertUrlAllowed("https://api.tavily.com/search", {
        domains: ["api.tavily.com", ...allowedDomains],
      });
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
