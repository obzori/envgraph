# Limitations

What envgraph does today, what it does not, and what is planned.

## Implemented

- CLI with commands: `scan`, `check`, `create example`, `create config`, `help`,
  `version`, and the default `envgraph` check.
- Project configuration via `envgraph.config.{ts,mts,js,mjs,cjs,json}`,
  discovered automatically (nearest wins) with upward search that stops at
  the project root; a broken config warns and falls back to defaults.
- AST-based detection of environment variable access across four runtimes:
  - **Node.js** — `process.env.NAME`, `process.env["NAME"]`, destructuring
    (`const { NAME } = process.env`), including rename and defaults.
  - **Vite** — `import.meta.env.NAME`, bracket notation, destructuring.
  - **Bun** — `Bun.env.NAME`, bracket notation, destructuring.
  - **Deno** — `Deno.env.get("NAME")` with a string literal argument.
- Detection of environment loading: `import "dotenv/config"`,
  `dotenv.config()` (including static `path` options and
  `require("dotenv").config()`), and Node's `process.loadEnvFile()`.
- Local modules or variables named `dotenv` are correctly shadowed and not
  reported as loaders.
- Discovery of `.env*` files by filename convention (contents never read).
- Grouped, sorted, line-accurate scan report on stdout; parse errors on
  stderr.
- `.env.example` generation from `.env` with name-based secret blanking,
  order/formatting preservation, `--force`, `--dry-run`, and a TTY-gated
  overwrite prompt. Configurable via the config file:
  `example.keepComments` and `example.defaults` (full per-key override).
- Include/exclude glob filtering via config (`include`, `exclude` keys).
- A dim stderr hint when running `scan` from a project subfolder.

## Not supported today

Scanning:

- Alias, e.g. `const e = process.env; e.PORT`.
- Dynamic bracket access, e.g. `process.env[name]`.
- `Deno.env.get(variable)` where the argument is not a string literal.
- Only usage *locations* are reported — no values and no linking of a
  variable to the `.env` file that defines it (usage and loading are
  detected separately, but not yet correlated into a dependency graph).
- Loader detection is limited to the npm `dotenv` package and Node's native
  `process.loadEnvFile()`; other loaders (`dotenvx`, framework-specific
  loading, `env-cmd`, etc.) are not recognized.
- Import resolution is specifier-based only: no path mapping, tsconfig
  aliases, or re-export tracking.

`.env` handling:

- No interpolation, multi-line values, or `export KEY=value`.
- The sanitizer is name-based and cannot detect secrets under benign names.
- Only `.env` to `.env.example`; no other file formats.

## Not yet functional / future ideas

Do not rely on the following:

- **Loader graph** — usage and loading are detected separately, but not yet
  correlated into a dependency graph linking a variable to the `.env` file
  that defines it.
- **`analyzeProject`/`runEnvGraph`** exist and delegate to `scanProject`, but
  no further orchestration (formatting/output) is wired up yet.

There is no watch mode and no plugin system at this time.
