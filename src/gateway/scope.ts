import { resolve } from "node:path";
import { minimatch } from "minimatch";

export class ScopeViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopeViolation";
  }
}

function matchesAny(value: string, patterns: string[]): boolean {
  return patterns.some((p) => minimatch(value, p, { dot: true, nocase: false }));
}

function shellGlobToRegex(pattern: string): RegExp {
  let re = "";
  for (const ch of pattern) {
    if (ch === "*") re += ".*";
    else if (ch === "?") re += ".";
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "s");
}

function shellMatchesAny(command: string, patterns: string[]): boolean {
  return patterns.some((p) => shellGlobToRegex(p).test(command));
}

export function assertShellAllowed(command: string, scope: Record<string, any>): void {
  const allow: string[] = Array.isArray(scope.allow) ? scope.allow : [];
  const deny: string[] = Array.isArray(scope.deny) ? scope.deny : [];
  const trimmed = command.trim();
  if (deny.length && shellMatchesAny(trimmed, deny)) {
    throw new ScopeViolation(`Command blocked by deny-list: ${trimmed}`);
  }
  if (!allow.length || !shellMatchesAny(trimmed, allow)) {
    throw new ScopeViolation(
      `Command not permitted by this outfit's shell.exec allow-list: ${trimmed}`
    );
  }
}

export function assertPathAllowed(path: string, scope: Record<string, any>): string {
  const paths: string[] = Array.isArray(scope.paths) ? scope.paths : [];
  const abs = resolve(process.cwd(), path);
  if (!paths.length || (!matchesAny(path, paths) && !matchesAny(abs, paths))) {
    throw new ScopeViolation(
      `Path not permitted by this outfit's fs allow-list: ${path}`
    );
  }
  return abs;
}

export function assertUrlAllowed(url: string, scope: Record<string, any>): URL {
  const domains: string[] = Array.isArray(scope.domains) ? scope.domains : [];
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ScopeViolation(`Invalid URL: ${url}`);
  }
  if (!domains.length || !matchesAny(parsed.hostname, domains)) {
    throw new ScopeViolation(
      `Host "${parsed.hostname}" not permitted by this outfit's domain allow-list.`
    );
  }
  return parsed;
}
