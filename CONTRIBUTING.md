# Contributing to Outfit

Thanks for your interest in improving Outfit. It is a small, dependency-light
TypeScript package, so getting set up is quick.

## Development setup

```bash
npm install
npm run build      # tsc -> dist/ (with type declarations)
npm test           # builds first, then runs the node:test suites
```

The test runner is Node's built-in `node --test`. Tests live in `test/` and import
from the compiled `dist/`, so always build (or run `npm test`, which builds for you)
before running a single test file.

## Project layout

- `src/spec/` - schema, ontology, and the outfit loader (the portable core)
- `src/gateway/` - the MCP gateway that implements and enforces capabilities
- `src/adapters/` - per-runtime compilers and conformance matrices
- `src/cli/` - the `outfit` command
- `test/` - node:test suites
- `examples/` - example outfits
- `schema/` - JSON Schema for editor validation

## Adding a capability

1. Add the capability id and its input schema to `src/spec/ontology.ts`.
2. Add a handler in `src/gateway/capabilities.ts` that scope-checks before acting.
3. Add or extend a test under `test/`.
4. Keep scopes least-privilege; every new capability must be checked on every call.

## Pull requests

- Keep runtime dependencies minimal. A new runtime dependency needs a strong reason.
- Add tests for any behavior change, especially anything touching scope enforcement.
- Run `npm test` and make sure all suites pass before opening the PR.
- Use hyphens, not em-dashes, and avoid code comments where a clear name will do.
- Describe the change and the motivation in the PR body.

## Reporting security issues

Please do not open public issues for security problems. See `SECURITY.md`.
