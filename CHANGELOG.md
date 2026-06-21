# Changelog

All notable changes to this project are documented here. The format is based on
Keep a Changelog, and this project adheres to semantic versioning.

## [Unreleased]

### Security
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
