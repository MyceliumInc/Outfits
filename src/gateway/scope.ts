import { resolve, relative, dirname, basename, join } from "node:path";
import { existsSync, realpathSync } from "node:fs";
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
  return new RegExp(`^${re}$`);
}

function shellMatchesAny(command: string, patterns: string[]): boolean {
  return patterns.some((p) => shellGlobToRegex(p).test(command));
}

const SHELL_OPERATORS = /[;&|`<>\n\r]|\$\(|\$\{|\(\)/;

export function normalizeCommand(command: string): string {
  return command.trim();
}

export function assertShellAllowed(command: string, scope: Record<string, unknown>): void {
  const allow = Array.isArray(scope.allow) ? (scope.allow as string[]) : [];
  const deny = Array.isArray(scope.deny) ? (scope.deny as string[]) : [];
  const normalized = normalizeCommand(command);
  if (SHELL_OPERATORS.test(normalized)) {
    throw new ScopeViolation(
      `Command contains a shell operator (one of ; & | \` < > $( ) which the gateway forbids to prevent chaining: ${normalized}`
    );
  }
  if (deny.length && shellMatchesAny(normalized, deny)) {
    throw new ScopeViolation(`Command blocked by deny-list: ${normalized}`);
  }
  if (!allow.length || !shellMatchesAny(normalized, allow)) {
    throw new ScopeViolation(
      `Command not permitted by this outfit's shell.exec allow-list: ${normalized}`
    );
  }
}

function canonicalTarget(abs: string): string {
  let cur = abs;
  const tail: string[] = [];
  while (!existsSync(cur)) {
    tail.unshift(basename(cur));
    const parent = dirname(cur);
    if (parent === cur) return abs;
    cur = parent;
  }
  let realBase: string;
  try {
    realBase = realpathSync(cur);
  } catch {
    return abs;
  }
  return tail.length ? join(realBase, ...tail) : realBase;
}

function realCwd(): string {
  try {
    return realpathSync(process.cwd());
  } catch {
    return process.cwd();
  }
}

export function assertPathAllowed(path: string, scope: Record<string, unknown>): string {
  const paths = Array.isArray(scope.paths) ? (scope.paths as string[]) : [];
  const abs = resolve(process.cwd(), path);
  if (!paths.length || (!matchesAny(path, paths) && !matchesAny(abs, paths))) {
    throw new ScopeViolation(`Path not permitted by this outfit's fs allow-list: ${path}`);
  }
  const canonical = canonicalTarget(abs);
  if (canonical !== abs) {
    const relCanonical = relative(realCwd(), canonical);
    if (!matchesAny(canonical, paths) && !matchesAny(relCanonical, paths)) {
      throw new ScopeViolation(
        `Path resolves through a symlink outside this outfit's fs allow-list: ${path}`
      );
    }
  }
  return abs;
}

function domainMatches(host: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(2);
    return host === suffix || host.endsWith("." + suffix);
  }
  return host === pattern;
}

export function assertUrlAllowed(url: string, scope: Record<string, unknown>): URL {
  const domains = Array.isArray(scope.domains) ? (scope.domains as string[]) : [];
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ScopeViolation(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ScopeViolation(`URL scheme "${parsed.protocol}" is not allowed (only http/https).`);
  }
  if (!domains.length || !domains.some((d) => domainMatches(parsed.hostname, d))) {
    throw new ScopeViolation(
      `Host "${parsed.hostname}" not permitted by this outfit's domain allow-list.`
    );
  }
  return parsed;
}
