<div align="center">
  <img src="images/logo.svg" width="520" alt="envgraph" />

  <p>
    <strong>Map your environment variables.</strong><br>
    <sub>Static analysis for JavaScript & TypeScript projects.</sub>
  </p>

  <p>
    <a href="https://www.npmjs.com/package/envgraph">
      <img src="https://img.shields.io/npm/v/envgraph?style=flat-square&label=npm&color=CB3837" alt="npm version" />
    </a>
    <a href="https://www.npmjs.com/package/envgraph">
      <img src="https://img.shields.io/npm/dm/envgraph?style=flat-square&label=downloads&color=CB3837" alt="npm downloads" />
    </a>
    <a href="https://github.com/obzori/envgraph">
      <img src="https://img.shields.io/github/stars/obzori/envgraph?style=flat-square&label=stars&color=f5c542" alt="GitHub stars" />
    </a>
    <a href="https://github.com/obzori/envgraph/issues">
      <img src="https://img.shields.io/github/issues/obzori/envgraph?style=flat-square&label=issues&color=8b5cf6" alt="GitHub issues" />
    </a>
    <a href="https://opensource.org/licenses/MIT">
      <img src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" alt="MIT License" />
    </a>
  </p>

  <p>
    <img src="https://img.shields.io/node/v/envgraph?style=flat-square&label=Node.js&color=5FA04E" alt="Node.js >= 23.6" />
    <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5.x" />
    <img src="https://img.shields.io/badge/runtime%20dependency-chalk-18181b?style=flat-square&logo=npm&logoColor=white" alt="Runtime dependency: chalk" />
  </p>

  <sub>
    Find usages · detect loaders · discover <code>.env</code> files · generate <code>.env.example</code>
  </sub>

  <br>
</div>
<br>
**envgraph** is a static analyzer that maps environment variables to the
files that use them in JavaScript and TypeScript projects — and analyzes how
those variables are loaded.

## Why envgraph?

The set of environment variables a project actually reads is scattered across
many files, and full-text search is noisy and unstructured. envgraph answers
questions like *"which files read `DATABASE_URL`?"*, *"is `JWT_SECRET` still
used anywhere?"*, or *"where do we load `.env` from?"* by parsing your source
files with the TypeScript compiler API — not regex. It detects both variable
**usage** (`process.env.PORT`) and environment **loading**
(`dotenv.config()`, `process.loadEnvFile(".env")`), plus the `.env*` files in
the project. Values are never read or printed.

It runs on Node.js only, has zero runtime dependencies, and never executes
your code.

## Features

- **Usage detection** — `process.env.NAME` (dot) and `process.env["NAME"]`
  (bracket with string literal), grouped per variable with exact locations.
- **Loader detection** — `import "dotenv/config"`, `dotenv.config()` (with
  static `path` options), and Node's native `process.loadEnvFile()`.
- **`.env` file discovery** — `.env`, `.env.local`, `.env.production`, etc.
- **Create example** — turns an existing `.env` into a commit-friendly
  `.env.example`, blanking values whose names look like secrets (heuristic).
  Configurable via `envgraph.config`: keep comments and set default values
  for specific keys (full override, even for sensitive-looking names).
- **Project configuration** — `envgraph.config.{js,mjs,cjs,ts,mts,json}` is
  discovered automatically in the project root; run from any subfolder and
  the config is still found.
- **Safe static analysis** — exact locations only; `.env` values never appear
  in output; no code execution, no network access.

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
# 1. Find which variables your code uses, where, and how .env is loaded
npx envgraph scan
```

For a project like:

```text
.env
.env.local
src/config.ts
src/index.ts
```

where `src/config.ts` contains `process.env.PORT` and `src/index.ts` contains
`import "dotenv/config";`, the output is:

```text
1 usages · 1 variables
1 env loaders

PORT  src/config.ts:1

Environment loaders

dotenv  src/index.ts:1

.env files

.env
.env.local
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

```bash
# 3. Scaffold a config file (envgraph.config.ts for TS projects, .js otherwise)
npx envgraph create config
```

Edit it to customize `.env.example` generation, e.g.:

```js
export default {
  example: {
    keepComments: true,
    defaults: { DISCORD_TOKEN: "enter_here_your_discord_token" },
  },
};
```

The config is picked up automatically on every run; when you launch envgraph
from a subfolder, it is found in the project root and a hint is printed.

## CLI Overview

| Command | Description |
| --- | --- |
| `envgraph` | Check that envgraph is installed and working. |
| `envgraph scan` | Detect `process.env` usages in the project's source files. |
| `envgraph check` | Compare `.env` declarations with actual usage; exit `1` on missing variables. |
| `envgraph create example [--force] [--dry-run]` | Generate `.env.example` from `.env`. |
| `envgraph create config [--force] [--dry-run] [--ts\\|--js]` | Generate an `envgraph.config.ts/js` scaffold. |
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
- **Документация на русском:** [docs/russian/README.md](docs/russian/README.md)

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
<br>
<p>
  <img src="images/obzori.svg" width="100" alt="Obzori Logo">
  <br>
  <sub>Made with ❤️ by obzori</sub>
</p>
