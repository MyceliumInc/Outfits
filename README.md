# Outfit

**Portable, enforced agent personas. One spec — any runtime.**

An **Outfit** is a single declarative file that describes an agent persona: who it
is (prompt), what it can do (capabilities), the skills it wears, the integrations
it needs — and a **requirements contract that is actually enforced**. Outfits are
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

The trick is the **Outfit Gateway** — an MCP server that *is the agent's entire
tool-world*:

- **Capabilities** (the portable core — `shell.exec`, `fs.read`, `http.fetch`,
  `web.search`, …) are implemented *by the gateway itself* and scope-checked on
  every call. Same behavior on every runtime.
- **Integrations** (raw MCP servers) are launched as children and proxied through,
  exposing only the tools the contract allows.
- Each adapter then **locks the runtime down to the gateway** and disables native
  tools. The agent can only do what the contract permits.

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
outfit doff                       # take it off, restore native tools
```

In Claude Code, install the picker and use `/outfit`:

```bash
outfit install-command            # writes .claude/commands/outfit.md
# then type /outfit in Claude Code to pick from a list
```

## The spec

```yaml
apiVersion: outfit/v1
name: stock-analyst
description: Buy-side equity analyst.
identity:
  prompt: |
    You are a skeptical buy-side equity analyst...
capabilities:                     # PORTABLE — implemented + enforced by the gateway
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

The ontology is a living registry — add a capability in `src/spec/ontology.ts` and
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
| `outfit doff` | Remove the worn outfit |
| `outfit gateway --outfit <file>` | Run the gateway (used by adapters) |
| `outfit targets` | List adapters + conformance matrices |
| `outfit install-command` | Install the `/outfit` slash command |

## Targets

| Target | gateway | deny-native | hooks | slash | integrations |
|--------|:-:|:-:|:-:|:-:|:-:|
| `claude-code` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `openai-agents` | ✓ | ✓¹ | – | – | ✓ |

¹ by omission — the agent is only given the gateway.

## Search paths

Outfits are discovered (in order) from:
1. `./outfits/`
2. `~/.outfit/outfits/`
3. bundled `examples/`

## Project layout

```
src/spec/       schema + ontology + loader        (portable core)
src/gateway/    MCP gateway: implements + enforces capabilities
src/adapters/   per-runtime compilers + conformance matrices
src/cli/        the `outfit` command
examples/       example outfits
registry/       static registry site
```

## License

MIT
