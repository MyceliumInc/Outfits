# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Outfit turns an agent persona into a contract the runtime enforces, not a prompt it can
ignore. An outfit is one declarative YAML/JSON file (identity + capabilities + permissions
+ optional integrations/skills). The package is the `@myceliuminc/outfit` npm CLI/library.

## Commands

```bash
npm run build      # tsc -> dist/ (+ .d.ts), then chmods dist/cli/index.js
npm test           # runs `pretest` (build) then `node --test` over test/
npm run dev        # tsc -w
```

Tests import from compiled `dist/`, **not** `src/`. Always build before running a single
test file:

```bash
npm run build && node --test test/scope.test.mjs   # one suite
```

CI runs `npm ci && npm run build && npm test` on Node 18, 20, 22. Minimum is Node 18.

## Architecture

The codebase is small (~1800 LOC of TS) and split into four layers under `src/`, mirrored
by `dist/` and the public barrel `src/index.ts`:

- **`src/spec/`** — the portable core. `schema.ts` (zod) defines the outfit document;
  `ontology.ts` is the closed set of capability ids (`shell.exec`, `fs.read/write/list`,
  `http.fetch`, `web.search`), each with a `ScopeKind` (`shell`/`fs`/`net`) and JSON input
  schema; `index.ts` is the loader/validator/discovery (`loadOutfit`, `validateSemantics`,
  `discoverOutfits`, `resolveOutfit`).
- **`src/gateway/`** — the enforcement engine. `server.ts` builds an MCP server that IS the
  agent's whole tool-world: each capability becomes a gateway tool; each integration is a
  child MCP server launched and proxied (only allow-listed tools exposed). `capabilities.ts`
  holds the per-capability `HANDLERS` (each scope-checks *before* acting) and `sanitizedEnv`.
  `scope.ts` holds the three enforcers — `assertShellAllowed`, `assertPathAllowed`,
  `assertUrlAllowed` — and is the security-critical file.
- **`src/adapters/`** — per-runtime compilers. Each `Adapter` has a `conformance` matrix
  (`routeViaGateway`, `denyNative`, `hooks`, `slashCommands`, `integrations`) and a
  `compile()` that emits runtime config. `claude-code.ts` writes `.mcp.json` (registers the
  gateway), `.claude/settings.json` (denies `NATIVE_TOOLS`, allows `mcp__outfit-<name>__*`),
  and a delimited persona block in `CLAUDE.md`. `openai-agents.ts` is experimental. Register
  new adapters in `ADAPTERS` in `index.ts`.
- **`src/cli/`** — the `outfit` command (`index.ts`) and `doctor.ts` (preflight that checks
  whether a target's conformance can satisfy the outfit). The `use`/`doff` lifecycle is
  CLI-only; everything else is also exported as a library.

### The enforcement flow (the big picture)

`outfit use` → adapter `compile()` writes project config that (1) registers the gateway MCP
server and (2) denies the runtime's native tools. When the agent runs, its only tools are
gateway tools; every call hits a `scope.ts` enforcer before any side effect. "Read-only"
means the agent *physically cannot write* — `fs.write` was never in its world.

## When changing things

- **Adding a capability** requires three coordinated edits: the id + input schema in
  `src/spec/ontology.ts`, a scope-checking handler in `src/gateway/capabilities.ts`, and a
  test. Capability ids must stay in the ontology — unknown ids fail `validateSemantics`.
- **`scope.ts` is security-critical.** It blocks shell operators (`; & | \` < > $( ${`,
  newlines) to prevent chaining, confines `fs.*` to each glob's static root, canonicalizes
  symlinks segment-by-segment, matches domains exactly/by dot-bounded suffix, and rejects
  internal/link-local hosts unless named explicitly. Changes here need tests
  (`test/scope.test.mjs`, `escape.test.mjs`, `security.test.mjs`, `redirect.test.mjs`).
- Keep runtime deps minimal: only `@modelcontextprotocol/sdk`, `zod`, `yaml`, `minimatch`.
  The CLI uses Node's built-in `util.parseArgs`. A new runtime dependency needs a strong reason.
- Repo convention (from CONTRIBUTING.md): hyphens not em-dashes; avoid comments where a
  clear name will do.
- Example outfits live in `examples/`; `schema/outfit.schema.json` is the published JSON
  Schema for editor validation. Outfits are discovered from `./outfits/`,
  `~/.outfit/outfits/`, then the bundled `examples/`.
