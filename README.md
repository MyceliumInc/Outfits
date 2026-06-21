# Outfit

[![CI](https://github.com/MyceliumInc/Outfits/actions/workflows/ci.yml/badge.svg)](https://github.com/MyceliumInc/Outfits/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**Turn an agent persona into a contract the runtime actually enforces, not a prompt it can ignore.**

An Outfit is one declarative file that defines an agent persona - its identity, the
capabilities it is allowed to use, the skills it wears - plus a permissions contract
that is enforced at runtime. MCP gives an agent raw capability with no boundaries.
System prompts and Skills give it instructions it can quietly ignore. Outfit makes the
contract real: a gateway becomes the agent's entire tool-world, every call is
scope-checked, and native tools are denied. So "read-only reviewer" means it
**physically cannot write**.

```
                  WITHOUT OUTFIT                            WITH OUTFIT

  agent ── "please don't edit files" (prompt)       agent  (sees only the gateway)
    │                                                  │
    ▼                                                  ▼
  [ native tools: Edit, Bash, Write, ... ]      ┌──────────────────────────────┐
    │        the agent can ignore the ask       │       OUTFIT GATEWAY          │
    ▼                                           │  an MCP server that IS the    │
  filesystem / shell / network  ◄── oops        │  agent's whole tool-world     │
                                                ├──────────────────────────────┤
                                                │  every call is scope-checked  │
                                                │   fs.read    paths: **/*    ✓ │
                                                │   fs.write   not granted    ✗ │
                                                │   shell.exec allow: git diff* │
                                                │              deny:  git push* │
                                                │   http.fetch domains:*.sec.gov│
                                                └───────────────┬──────────────┘
                                                                ▼
                                       native tools DENIED · only permitted calls pass
```

|                                            |  MCP  | Skills / prompts |  Outfit  |
| ------------------------------------------ | :---: | :--------------: | :------: |
| Gives the agent capability                 |  yes  |        no        |   yes    |
| Gives the agent instructions               |  no   |       yes        |   yes    |
| Permissions enforced, not just asked       |  no   |        no        |   yes    |
| Agent can ignore the boundary              |  n/a  |       yes        |    no    |
| Portable across runtimes                   | part  |        no        |   yes    |
| Shareable as one unit                      |  no   |     per-tool     |   yes    |

> MCP is what an agent *can* do. Skills are what you *tell* it to do. Outfit is what it is *allowed* to do.

## Quickstart

Install from source (not yet published to npm):

```bash
git clone https://github.com/MyceliumInc/Outfits && cd Outfits
npm install && npm run build && npm link
```

Then:

```bash
outfit doctor code-reviewer     # can this runtime actually enforce it?
outfit use code-reviewer        # wear it in the current project
# reload Claude Code
```

Then ask the agent to change a file:

```
You:  Fix the bug in src/auth.ts

Agent (wearing code-reviewer):
  I can't modify files while wearing this outfit - I'm read-only.
  Here's the fix to apply yourself:

  src/auth.ts:42  the token check is inverted:
  -  if (!isValid(token)) return ok()
  +  if (!isValid(token)) return deny()
```

The agent did not *decide* to stay read-only. The Edit tool was never in its world;
the only filesystem capability it has is `fs.read`. Take it off any time:

```bash
outfit status     # code-reviewer (claude-code)
outfit doff       # native tools restored, exactly as before
```

## How enforcement works

The trick is the **Outfit Gateway**, an MCP server that is the agent's entire tool-world:

- **Capabilities** (`shell.exec`, `fs.read`, `http.fetch`, `web.search`, ...) are
  implemented by the gateway itself and scope-checked on every call. Same behavior on
  every runtime.
- **Integrations** (raw MCP servers) are launched as children and proxied through,
  exposing only the tools the contract allows.
- Each adapter then **locks the runtime down to the gateway** and disables native tools.
- The **persona** clothes the main session directly (for Claude Code, a delimited block
  in `CLAUDE.md`), so the agent adopts the identity and inherits the locked-down world.

Enforcement is per-runtime, so every adapter publishes a **conformance matrix**. If an
outfit requires something an adapter cannot guarantee, `outfit doctor` fails for that
target. That is the honest meaning of "enforced".

## The spec

This is the `code-reviewer` outfit that produced the demo above:

```yaml
apiVersion: outfit/v1
name: code-reviewer
description: Read-only code reviewer that inspects the diff and never edits.
identity:
  prompt: |
    You are a precise, senior code reviewer. You never modify files; you can only
    read and run read-only inspection commands.
capabilities:
  - id: shell.exec
    scope:
      allow: ["git diff*", "git log*", "rg *", "ls *", "cat *"]
      deny:  ["git push*", "git commit*", "rm *"]
  - id: fs.read
    scope: { paths: ["**/*"] }
  - id: fs.list
    scope: { paths: ["**/*"] }
```

Add `# yaml-language-server: $schema=https://raw.githubusercontent.com/MyceliumInc/Outfits/HEAD/schema/outfit.schema.json` as
the first line of your outfit for editor validation. See [`examples/`](examples/) for
more, including `stock-analyst` (web + scoped writes) and `notes-keeper` (an integration).

### Capability ontology

| Capability   | Scope                          |
| ------------ | ------------------------------ |
| `shell.exec` | `allow` / `deny` command globs |
| `fs.read`    | `paths` globs                  |
| `fs.write`   | `paths` globs                  |
| `fs.list`    | `paths` globs                  |
| `http.fetch` | `domains` globs                |
| `web.search` | `domains` globs (+ provider)   |

`web.search` needs `OUTFIT_SEARCH_PROVIDER` (e.g. `tavily`) and `OUTFIT_SEARCH_API_KEY`.
Add a capability in `src/spec/ontology.ts` and a handler in `src/gateway/capabilities.ts`
and it becomes available to every adapter.

## Let Claude author one for you

```bash
outfit install-skill              # writes .claude/skills/create-outfit/SKILL.md
```

Then ask Claude to "make an outfit that ...". The skill interviews you, picks
least-privilege capabilities, writes the spec, and runs `outfit validate` and
`outfit doctor` to check it. (`outfit install-command` adds the `/outfit` picker.)

## Security model

The gateway is the only tool-world the agent has, so enforcement happens at the
capability boundary, not in the prompt. On every call:

- **Shell operator blocking.** `shell.exec` rejects commands containing
  `;  &  |  backtick  <  >  $(  ${` and newlines, so an allow-listed wildcard like
  `git diff*` cannot chain a second command.
- **Filesystem root confinement.** `fs.*` paths are confined to the static root of each
  allowed glob, so a broad pattern like `**/*` still cannot reach `/etc/passwd`.
- **Symlink canonicalization.** Paths are resolved to a fixed point segment by segment,
  so a symlink (or a chain of them) cannot point outside the allow-list.
- **Exact / suffix domains.** Hosts match exactly or by dot-bounded suffix
  (`*.sec.gov` matches `sec.gov` and `data.sec.gov`, never `evilsec.gov`). Redirects are
  re-checked on every hop and non-http(s) schemes are rejected.
- **Sanitized environment.** Shell and integration child processes get a small allow-list
  of env vars; secrets and `OUTFIT_*` are never passed through.
- **Native-tool denial.** Each adapter disables the runtime's built-in tools so the agent
  cannot route around the contract.

### Limitations

Outfit raises the floor; it is not a sandbox.

- **Exec escapes.** Allow-listing a binary that can spawn other programs (interpreters,
  `find -exec`, pagers, `git -c`) can be used to break out. Allow-list the narrowest
  commands you can and prefer deny-by-default.
- **Integration arguments are not gated.** Proxied integration calls pass through without
  argument-level scope checks. Only grant integrations you trust.
- **Domain allow-listing is name-based.** It does not stop DNS rebinding or requests to
  internal or link-local IPs. Do not treat it as a network firewall.

## CLI

| Command | What it does |
| ------- | ------------ |
| `outfit list [--json]` | Discover outfits across search paths |
| `outfit add <url\|github:..\|name>` | Fetch and install an outfit |
| `outfit remove <name>` | Remove an installed outfit |
| `outfit init <name>` | Scaffold a new outfit in `./outfits` |
| `outfit validate <ref> [--json]` | Schema + ontology validation |
| `outfit doctor <ref> [-t target] [--json]` | Preflight: can the target enforce it? |
| `outfit compile <ref> -t <target> -o <dir>` | Emit runtime config |
| `outfit use <ref> [-t target] [--force]` | Wear it in the current project |
| `outfit status [--json]` | Show the outfit worn here |
| `outfit doff` | Remove the worn outfit |
| `outfit targets [--json]` | List adapters + conformance matrices |
| `outfit install-command` | Install the `/outfit` picker |
| `outfit install-skill` | Install the `create-outfit` skill |

Run `outfit <command> --help` for per-command usage.

## Programmatic API

The spec, gateway, doctor, and adapters are available as a typed ESM library:

```ts
import { loadOutfit, validateSemantics, doctor, runGateway, ONTOLOGY } from "@myceliuminc/outfit";

const { outfit } = loadOutfit("outfits/code-reviewer.outfit.yaml");
if (doctor(outfit, "claude-code").ok) {
  await runGateway(outfit); // serve the outfit as an MCP gateway
}
```

The scope enforcers (`assertShellAllowed`, `assertPathAllowed`, `assertUrlAllowed`),
`buildGatewayServer`, and the adapter registry (`ADAPTERS`, `getAdapter`) are exported too.
The `use` / `doff` lifecycle is CLI-only.

## Targets

| Target | gateway | deny-native | hooks | slash | integrations |
| ------ | :-----: | :---------: | :---: | :---: | :----------: |
| `claude-code` | yes | yes | yes | yes | yes |
| `openai-agents` (experimental) | yes | yes (by omission) | no | no | yes |

The `openai-agents` adapter emits an agent script; verify it against your installed
`@openai/agents` version.

## Reference

<details>
<summary>Search paths, project layout, development</summary>

Outfits are discovered (in order) from `./outfits/`, `~/.outfit/outfits/`, and the
bundled `examples/`.

```
src/index.ts    public API barrel
src/spec/       schema + ontology + loader (portable core)
src/gateway/    MCP gateway: implements + enforces capabilities
src/adapters/   per-runtime compilers + conformance matrices
src/cli/        the `outfit` command
test/           node:test suites
```

```bash
npm install
npm run build      # tsc -> dist/ (+ type declarations)
npm test           # builds, then runs the suites
```

Runtime dependencies are kept deliberately small: the MCP SDK, `zod`, `yaml`, and
`minimatch`. The CLI uses Node's built-in `util.parseArgs`.

</details>

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Licensed MIT.
