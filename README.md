# Outfit

**Portable, enforced agent personas. One spec - any runtime.**

An **Outfit** is a single declarative file that describes an agent persona: who it
is (prompt), what it can do (capabilities), the skills it wears, the integrations
it needs - and a **requirements contract that is actually enforced**. Outfits are
portable across runtimes (Claude Code, the OpenAI Agents SDK, …) and shareable via
a registry.

It sits between MCP (raw capabilities) and Skills (instructions): an Outfit
*composes* both into one shareable, validated, enforced unit.

```
MCP  ───┐
        ├──►  OUTFIT (persona + contract)  ──►  any runtime
Skills ─┘
```

## How enforcement works

The trick is the **Outfit Gateway** - an MCP server that *is the agent's entire
tool-world*:

- **Capabilities** (the portable core - `shell.exec`, `fs.read`, `http.fetch`,
  `web.search`, …) are implemented *by the gateway itself* and scope-checked on
  every call. Same behavior on every runtime.
- **Integrations** (raw MCP servers) are launched as children and proxied through,
  exposing only the tools the contract allows.
- Each adapter then **locks the runtime down to the gateway** and disables native
  tools. The agent can only do what the contract permits.
- The **persona** clothes the main session directly (for Claude Code, a delimited
  block in `CLAUDE.md`), so the agent both adopts the identity and inherits the
  locked-down tool-world.

Because enforcement is per-runtime, every adapter publishes a **conformance
matrix**. If an outfit hard-requires something an adapter can't guarantee,
`outfit doctor` fails for that target. That's the honest meaning of "enforced."

## Install

```bash
npm install -g outfit      # or: npm link (from this repo, after npm run build)
```

## Quickstart

```bash
outfit list                       # discover outfits
outfit doctor code-reviewer       # can this runtime enforce it?
outfit use code-reviewer          # wear it in the current project (Claude Code)
# … reload Claude Code …
outfit status                     # what am I wearing here?
outfit doff                       # take it off, restore native tools
```

In Claude Code, install the picker and use `/outfit`:

```bash
outfit install-command            # writes .claude/commands/outfit.md
# then type /outfit in Claude Code to pick from a list
```

To have Claude author a brand-new outfit for you, install the skill:

```bash
outfit install-skill              # writes .claude/skills/create-outfit/SKILL.md
# then just ask Claude to "make an outfit that ..." and it takes over:
# it interviews you, picks least-privilege capabilities, writes the spec,
# and runs `outfit validate` + `outfit doctor` to check it.
```

## The spec

```yaml
apiVersion: outfit/v1
name: stock-analyst
description: Buy-side equity analyst.
identity:
  prompt: |
    You are a skeptical buy-side equity analyst...
capabilities:                     # PORTABLE - implemented + enforced by the gateway
  - id: web.search
    enforcement: hard
    scope: { domains: ["*"] }
  - id: fs.write
    enforcement: hard
    scope: { paths: ["reports/**"] }
skills:                           # compile to native skills, or inline into prompt
  - id: dcf-model
    inline: "To sanity-check a valuation, run a 5-year DCF..."
integrations: []                  # escape hatch: raw MCP servers (non-portable)
extensions: {}                    # runtime-specific extras (hooks, slash), gated
```

See [`examples/`](examples/) for full outfits.

## Capability ontology (v0)

| Capability   | Scope                          |
|--------------|--------------------------------|
| `shell.exec` | `allow` / `deny` command globs |
| `fs.read`    | `paths` globs                  |
| `fs.write`   | `paths` globs                  |
| `fs.list`    | `paths` globs                  |
| `http.fetch` | `domains` globs                |
| `web.search` | `domains` globs (+ provider)   |

`web.search` needs a provider: set `OUTFIT_SEARCH_PROVIDER=tavily` and
`OUTFIT_SEARCH_API_KEY`.

The ontology is a living registry - add a capability in `src/spec/ontology.ts` and
a handler in `src/gateway/capabilities.ts`, and it's available to every adapter.

## CLI

| Command | What it does |
|---------|--------------|
| `outfit list [--json]` | Discover outfits across search paths |
| `outfit init <name>` | Scaffold a new outfit in `./outfits` |
| `outfit validate <ref>` | Schema + ontology validation |
| `outfit doctor <ref> [-t target]` | Preflight: can the target enforce it? |
| `outfit compile <ref> -t <target> -o <dir>` | Emit runtime config |
| `outfit use <ref> [-t target]` | Wear it in the current project |
| `outfit status [--json]` | Show the outfit worn in this project |
| `outfit doff` | Remove the worn outfit |
| `outfit gateway --outfit <file>` | Run the gateway (used by adapters) |
| `outfit targets` | List adapters + conformance matrices |
| `outfit install-command` | Install the `/outfit` picker slash command |
| `outfit install-skill` | Install the `create-outfit` skill for Claude Code |

## Programmatic API

Everything the CLI does is available as a typed library (ESM):

```ts
import {
  loadOutfit,
  validateSemantics,
  doctor,
  runGateway,
  ONTOLOGY,
} from "outfit";

const { outfit } = loadOutfit("outfits/code-reviewer.outfit.yaml");
const issues = validateSemantics(outfit);
if (doctor(outfit, "claude-code").ok) {
  await runGateway(outfit); // serve the outfit as an MCP gateway
}
```

The scope enforcers (`assertShellAllowed`, `assertPathAllowed`, `assertUrlAllowed`)
and the adapter registry (`ADAPTERS`, `getAdapter`) are exported too.

## Targets

| Target | gateway | deny-native | hooks | slash | integrations |
|--------|:-:|:-:|:-:|:-:|:-:|
| `claude-code` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `openai-agents` | ✓ | ✓¹ | - | - | ✓ |

¹ by omission - the agent is only given the gateway.

## Search paths

Outfits are discovered (in order) from:
1. `./outfits/`
2. `~/.outfit/outfits/`
3. bundled `examples/`

## Project layout

```
src/index.ts    public API barrel
src/spec/       schema + ontology + loader        (portable core)
src/gateway/    MCP gateway: implements + enforces capabilities
src/adapters/   per-runtime compilers + conformance matrices
src/cli/        the `outfit` command
test/           node:test suites
examples/       example outfits
registry/       static registry site
```

## Development

```bash
npm install
npm run build      # tsc → dist/ (+ type declarations)
npm test           # builds, then runs node:test suites
```

Runtime dependencies are kept deliberately small: the MCP SDK (the gateway),
`zod` (spec validation), `yaml` (spec parsing), and `minimatch` (scope globbing).
The CLI uses Node's built-in `util.parseArgs` - no argument-parsing dependency.

## License

MIT
