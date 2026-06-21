# Security Policy

Outfit's purpose is to enforce least-privilege agent personas, so security issues
are taken seriously.

## Reporting a vulnerability

Please report security issues privately. Do not open a public GitHub issue.

- Preferred: open a private advisory via GitHub Security Advisories on this repo
  (Security tab -> Report a vulnerability).
- Alternatively, email bnottonson@gmail.com with the details.

Please include:

- A description of the issue and its impact.
- Steps to reproduce, ideally a minimal outfit spec or command sequence.
- The affected version (`outfit --version`) and your runtime and OS.

We aim to acknowledge reports within a few business days.

## What the gateway enforces

- `shell.exec` rejects shell-chaining operators and enforces allow/deny globs.
- `fs.read` / `fs.write` / `fs.list` confine paths to an allowed root and resolve
  symlinks to a fixed point, blocking symlink escapes.
- `http.fetch` restricts schemes to http/https, enforces the domain allow-list, and
  re-validates the target on every redirect hop.
- Child MCP integrations run with a sanitized environment and are exposed only
  through the gateway, filtered by `allowTools`.

## Known limitations

Outfit raises the floor; it is not a sandbox.

- Allow-listing a binary that can spawn other programs (interpreters, `find -exec`,
  pagers, `git -c`) can be used to break out. Allow-list the narrowest commands you can.
- Integration tool arguments are not scope-checked; only grant integrations you trust.
- The domain allow-list is name-based: it does not stop DNS rebinding or requests to
  internal or link-local IPs. Do not treat it as a network firewall.

Reports that demonstrate a bypass of an enforced guarantee are especially valuable.
