import { resolve, relative, dirname, join, parse, sep } from "node:path";
import { existsSync, realpathSync, lstatSync, readlinkSync } from "node:fs";
import { minimatch } from "minimatch";

export class ScopeViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopeViolation";
  }
}

function glob(value: string, pattern: string): boolean {
  return minimatch(value, pattern, { dot: true, nocase: false });
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

const SHELL_OPERATORS = /[;&|`<>\n\r]|\$\(|\$\{/;

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

function patternRoot(pattern: string, base: string): string {
  const statics: string[] = [];
  for (const segment of pattern.split("/")) {
    if (/[*?[\]]/.test(segment)) break;
    statics.push(segment);
  }
  return resolve(base, statics.join("/") || ".");
}

function isWithin(target: string, root: string): boolean {
  return target === root || target.startsWith(root.endsWith(sep) ? root : root + sep);
}

const MAX_SYMLINK_HOPS = 40;

function canonicalTarget(abs: string): string {
  const { root } = parse(abs);
  let cur = root;
  outer: for (const segment of abs.slice(root.length).split(sep).filter(Boolean)) {
    cur = join(cur, segment);
    for (let hop = 0; hop < MAX_SYMLINK_HOPS; hop++) {
      let stat;
      try {
        stat = lstatSync(cur);
      } catch {
        break outer;
      }
      if (!stat.isSymbolicLink()) break;
      cur = resolve(dirname(cur), readlinkSync(cur));
    }
  }
  return cur;
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
  if (!paths.length) {
    throw new ScopeViolation(`Path not permitted by this outfit's fs allow-list: ${path}`);
  }
  const cwd = process.cwd();
  const abs = resolve(cwd, path);
  const canonical = canonicalTarget(abs);

  const permitted = (target: string, relForGlob: string, base: string): boolean =>
    paths.some((p) => {
      const root = patternRoot(p, base);
      return isWithin(target, root) && (glob(relForGlob, p) || glob(target, p));
    });

  if (!permitted(abs, path, cwd)) {
    throw new ScopeViolation(`Path not permitted by this outfit's fs allow-list: ${path}`);
  }
  if (canonical !== abs && !permitted(canonical, relative(realCwd(), canonical), realCwd())) {
    throw new ScopeViolation(
      `Path resolves through a symlink outside this outfit's fs allow-list: ${path}`
    );
  }
  return canonical;
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
