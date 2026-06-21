# Changelog

All notable changes to this project are documented here. The format is based on
Keep a Changelog, and this project adheres to semantic versioning.

## [Unreleased]

### Security
- `fs.*` confines every path to an allowed root, so a broad glob like `**/*` can
  no longer satisfy an absolute path such as `/etc/passwd`.
- Path canonicalization resolves symlinks per segment, including a dangling final
  component, closing the `fs.write` symlink-escape; the canonical path is returned.
- Subprocess environments use a small allow-list instead of a leaky keyword denylist.

### Changed
- Removed the no-op `enforcement` field from capabilities (kept on integrations,
  where it controls fatal-vs-warn on launch failure).
- `doctor` reports per-capability runtime prerequisites (e.g. `web.search` env).
- Scope validation is driven by a single `SCOPE_KINDS` registry.

### Added
- Per-command help (`outfit <cmd> --help`) and `--json` output for `doctor`,
  `validate`, and `targets`; clean errors for unknown flags.
- `buildGatewayServer` is exported for embedding and testing the gateway.

### Security (initial hardening)
- `shell.exec` now rejects shell operators (`;`, `&`, `|`, backtick, `<`, `>`,
  `$(`, `${`) so an allow-listed wildcard can no longer authorize command chaining.
- `http.fetch` follows redirects manually and re-checks every hop against the
  domain allow-list, and rejects non-http(s) schemes (SSRF hardening).
- `fs.*` paths are canonicalized so a symlink cannot escape the allow-list.
- Domain matching is exact or dot-bounded suffix only (no substring wildcards).
- Shell and integration subprocesses run with a sanitized environment that omits
  secrets (`*KEY*`, `*TOKEN*`, `*SECRET*`, `OUTFIT_*`).
- The Claude Code native-tool deny-list covers more built-ins.

### Fixed
- `outfit use` auto-removes a previously worn outfit instead of orphaning it.
- `outfit doff` restores the project's prior permissions exactly and deletes the
  files and skill directories it created.
- `removeBlock` no longer leaves a doubled trailing newline.

### Added
- `outfit status` reports the worn outfit; `outfit install-skill` installs the
  `create-outfit` skill.
- Public library API (`import { ... } from "outfit"`) with type declarations.

## [0.1.0]

- Initial release: spec, gateway, Claude Code and OpenAI Agents adapters, CLI.
