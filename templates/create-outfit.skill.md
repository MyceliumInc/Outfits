---
name: create-outfit
description: Author a new Outfit, a portable and enforced agent persona (identity, capabilities, scoped permissions). Use when the user wants to create, make, design, scaffold, or write a new outfit.
allowed-tools: Bash(outfit *), Bash(npx outfit *), Read, Write, Edit
---

# Create an Outfit

You are helping the user author a new **Outfit**: a single declarative file that
defines an agent persona that is portable across runtimes and enforced by the
Outfit Gateway. Your job is to turn a fuzzy "I want an agent that does X" into a
valid, minimal, least-privilege outfit spec, then validate it.

## 1. Understand the persona

Ask only what you cannot infer. You need enough to fill in:

- **name**: kebab-case (a-z, 0-9, hyphen), e.g. `release-manager`.
- **what it is for**: one-line description.
- **identity**: how it should think and behave (becomes the system prompt).
- **what it must be able to do**: maps to capabilities below.
- **what it must NOT do**: shapes the scopes (least privilege).

Default to the narrowest set of capabilities that lets the persona do its job.
A read-only reviewer should not get `fs.write`; a report writer should be scoped
to a single output directory.

## 2. The spec

```yaml
apiVersion: outfit/v1
name: <kebab-case>
description: <one line>
version: 0.1.0

identity:
  prompt: |
    <who the agent is, its goals, and how it behaves. Be specific about the
    boundaries you also enforce below, so the model and the gateway agree.>

capabilities: []     # the portable, gateway-enforced core (see ontology)
skills: []           # instruction bundles, inlined into the persona
integrations: []     # raw MCP servers, the escape hatch (non-portable)
extensions: {}       # runtime-specific extras (hooks, slash commands)
```

## 3. Capability ontology

Only these capability ids exist. Each is implemented and scope-checked by the
gateway, so they behave identically on every runtime. The default posture is
deny: an empty scope denies everything.

| id           | scope shape                              |
|--------------|------------------------------------------|
| `shell.exec` | `allow` / `deny`: command glob patterns  |
| `fs.read`    | `paths`: path globs                      |
| `fs.write`   | `paths`: path globs                      |
| `fs.list`    | `paths`: path globs                      |
| `http.fetch` | `domains`: hostname globs                |
| `web.search` | `domains`: hostname globs (+ provider)   |

Each capability also takes `enforcement: hard | soft` (default `hard`). Hard
means the target runtime must be able to guarantee it or `outfit doctor` fails.

Scope examples:

```yaml
capabilities:
  - id: shell.exec
    enforcement: hard
    scope:
      allow: ["git diff*", "git log*", "rg *", "ls *"]
      deny:  ["git push*", "rm *"]
  - id: fs.read
    enforcement: hard
    scope:
      paths: ["**/*"]
  - id: fs.write
    enforcement: hard
    scope:
      paths: ["reports/**"]
  - id: http.fetch
    enforcement: hard
    scope:
      domains: ["*.sec.gov", "api.github.com"]
```

Notes:
- Shell globs: `*` spans everything including `/`. Always set `allow`; add `deny`
  for sharp edges even inside an allowed family (e.g. allow `git *`, deny `git push*`).
- The gateway blocks shell operators (`;`, `&`, `|`, backtick, `<`, `>`, `$(`, `${`)
  so an allowed command cannot chain another. It cannot stop a permitted binary
  from spawning processes via its own flags, so avoid wildcarding tools with exec
  escapes (`find`, `xargs`, `env`, `git -c`, `awk`, `sh`); scope to specific
  subcommands where possible.
- `web.search` needs a provider at run time: `OUTFIT_SEARCH_PROVIDER` (e.g. `tavily`)
  and `OUTFIT_SEARCH_API_KEY`.
- If the persona needs something not in this list, use `integrations` (a raw MCP
  server), and tell the user it is not portable across runtimes.

## 4. Skills (optional)

Skills are instruction bundles that get inlined into the persona prompt:

```yaml
skills:
  - id: dcf-model
    description: Quick discounted-cash-flow sanity check.
    inline: |
      <markdown instructions the agent should follow>
```

## 5. Write and validate

1. Scaffold a starting point: `outfit init <name>` writes `outfits/<name>.outfit.yaml`.
   Then edit it, or write the file directly using the spec above.
2. Validate the spec and ontology: `outfit validate <name>`. Fix every error.
3. Preflight enforcement for the target: `outfit doctor <name>` (defaults to
   `claude-code`; add `-t openai-agents` for that target). Resolve errors; explain
   any warnings to the user.

## 6. Hand off

Once it validates and doctor passes, tell the user how to wear it:

```
outfit use <name>     # in a real project, NOT the outfit source repo
# then restart Claude Code so the locked-down tool-world takes effect
```

Remind them that wearing an outfit denies native tools until restart, and that
`outfit doff` removes it. Do not run `outfit use` for them unless they ask; if you
do, never run it inside the outfit source repo (it will lock the session).
