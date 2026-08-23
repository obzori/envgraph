# envgraph

[![npm version](https://img.shields.io/npm/v/envgraph.svg)](https://www.npmjs.com/package/envgraph)
[![npm downloads](https://img.shields.io/npm/dm/envgraph.svg)](https://www.npmjs.com/package/envgraph)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![Node.js >= 23.6](https://img.shields.io/node/v/envgraph.svg)](https://www.npmjs.com/package/envgraph)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[![GitHub repository](https://img.shields.io/badge/GitHub-obzori%2Fenvgraph-181717?logo=github)](https://github.com/obzori/envgraph)
[![GitHub issues](https://img.shields.io/github/issues/obzori/envgraph.svg)](https://github.com/obzori/envgraph/issues)
[![GitHub last commit](https://img.shields.io/github/last-commit/obzori/envgraph.svg)](https://github.com/obzori/envgraph/commits)

**envgraph** is a static analyzer that maps environment variables to the files
that use them in JavaScript and TypeScript projects.

## Why envgraph?

The set of environment variables a project actually reads is scattered across
many files, and full-text search is noisy and unstructured. envgraph answers
questions like *"which files read `DATABASE_URL`?"* or *"is `JWT_SECRET` still
used anywhere?"* by parsing your source files with the TypeScript compiler API —
not regex — and reporting every variable with exact file and line numbers.
It can also generate a sanitized `.env.example` from your `.env`.

It runs on Node.js only, has zero runtime dependencies, and never executes
your code.

## Features

- **Scan** — detects `process.env.NAME` (dot) and `process.env["NAME"]`
  (bracket with string literal) accesses in `.js`, `.jsx`, `.ts`, `.tsx`
  files, grouped per variable with exact locations.
- **Create example** — turns an existing `.env` into a commit-friendly
  `.env.example`, blanking values whose names look like secrets (heuristic).
- Safe by design: reads source files and `.env`, writes only `.env.example`,
  and never executes project code.

## Requirements

- Node.js **>= 23.6.0**

## Installation

```bash
npm install --save-dev envgraph
# or run directly:
npx envgraph <command>
```

## Quick Start

```bash
# 1. Find which variables your code uses, and where
npx envgraph scan
```

```text
4 usages · 2 variables

LOG_LEVEL  src/app.ts:4
PORT       src/app.ts:1 ×3
```

```bash
# 2. Generate a .env.example from your .env
npx envgraph create example
```

```text
✓ Created .env.example

IMPORTANT: CHECK .env.example BEFORE COMMITTING IT.
Make sure it does not contain passwords, tokens, API keys,
private keys, credentials, or other sensitive information.
```

Always review the generated `.env.example` before committing it — the
sanitizer is a name-based heuristic, not a guarantee. See
[Security](docs/security.md).

## CLI Overview

| Command | Description |
| --- | --- |
| `envgraph` | Check that envgraph is installed and working. |
| `envgraph scan` | Detect `process.env` usages in the project's source files. |
| `envgraph create example [--force] [--dry-run]` | Generate `.env.example` from `.env`. |
| `envgraph help` | Show usage information. |
| `envgraph version` | Print the installed version. |

Global flags: `-h, --help`, `-v, --version`. Unknown commands exit with `1`.
Full details in the [CLI Reference](docs/cli.md).

## Documentation

- [CLI Reference](docs/cli.md)
- [Scanning](docs/scanning.md)
- [.env.example Generation](docs/env-example.md)
- [Security](docs/security.md)
- [Limitations](docs/limitations.md)
- [Development](docs/development.md)

## Development

Requires Node.js >= 23.6.0. No runtime dependencies; dev tooling is
`typescript` and `@types/node`.

```bash
git clone https://github.com/obzori/envgraph.git
cd envgraph
npm install
npm test        # typecheck + node:test suite
npm run build   # compile TypeScript to dist/
```

Contributions are welcome — see [Development](docs/development.md) for the
repository layout, npm scripts, and how to add CLI commands. Please open an
issue first for larger changes: [issue tracker](https://github.com/obzori/envgraph/issues).

## License

[MIT](https://opensource.org/licenses/MIT)

## Links

- [npm package](https://www.npmjs.com/package/envgraph)
- [GitHub repository](https://github.com/obzori/envgraph)
- [Issue tracker](https://github.com/obzori/envgraph/issues)
- [Changelog / releases](https://github.com/obzori/envgraph/releases)

# MADE WITH ❤️ BY OBZORI, FOR DEVELOPERS :3 nyah nyah