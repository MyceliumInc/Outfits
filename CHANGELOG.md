# Changelog

All notable changes to this project are documented here. The format is based on
Keep a Changelog, and this project adheres to semantic versioning.

## [0.1.4] - 2026-06-21

- Repository renamed `MyceliumInc/Outfits` -> `MyceliumInc/Outfit`. Updated all
  in-repo URLs (raw schema `$id` and `RAW_BASE`, README badges/links, package
  metadata, issue templates) to the new path.

## [0.1.3] - 2026-06-21

- `outfit add <name>` now falls back to the marketplace at `outfits.mycelium.markets`
  when a bare name is not found in the bundled GitHub registry.
- Document the marketplace (`outfits.mycelium.markets`) for browsing, downloading, and
  publishing outfits.

## [0.1.2] - 2026-06-21

- Add project logo: a cute multi-outfit mascot banner shown at the top of the README.

## [0.1.1] - 2026-06-21

Documentation and packaging fixes for the public release.

- README quickstart installs from npm (`npm install -g @myceliuminc/outfit`).
- `schema/outfit.schema.json` `$id` points at the canonical published URL.
- Security reports go through GitHub private advisories.

## [0.1.0] - 2026-06-21

Initial release: a spec, an enforcing MCP gateway, Claude Code and OpenAI Agents
adapters, and the `outfit` CLI and library.

### Capabilities and enforcement
- Portable capability ontology (`shell.exec`, `fs.read`, `fs.write`, `fs.list`,
  `http.fetch`, `web.search`) implemented and scope-checked by the gateway.
- `shell.exec` rejects shell operators (`;`, `&`, `|`, backtick, `<`, `>`, `$(`, `${`)
  so an allow-listed wildcard cannot chain another command.
- `fs.*` confines paths to an allowed root (a broad glob like `**/*` cannot reach
  `/etc/passwd`) and resolves symlinks to a fixed point, blocking single and chained
  symlink escapes; the canonical path is used.
- `http.fetch` restricts schemes to http/https, matches domains exactly or by
  dot-bounded suffix, re-validates every redirect hop, and blocks internal and
  link-local hosts unless explicitly allow-listed.
- Shell and integration subprocesses run with an allow-listed environment so secrets
  are not passed through.
- Adapters lock the runtime to the gateway and deny native tools.

### CLI and library
- `list`, `add`, `remove`, `init`, `validate`, `doctor`, `compile`, `use`, `status`,
  `doff`, `gateway`, `targets`, `install-command`, `install-skill`.
- `outfit add` fetches and installs an outfit from a URL, a `github:` ref, or the
  registry into `~/.outfit/outfits`.
- Per-command help (`outfit <cmd> --help`), `--json` for `doctor`/`validate`/`targets`,
  and clean errors for unknown flags or commands.
- `doctor` reports adapter conformance and per-capability runtime prerequisites.
- Personas clothe the main session via `CLAUDE.md`; `use`/`doff` snapshot and restore
  the project's prior state exactly.
- Strict schema validation (unknown keys are rejected, not silently dropped).
- Typed ESM library API (`loadOutfit`, `validateSemantics`, `doctor`, `runGateway`,
  `buildGatewayServer`, scope enforcers, adapter registry) with declarations.
- The `openai-agents` target is marked experimental.
