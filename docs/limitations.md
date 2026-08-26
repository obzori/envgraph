# Limitations

What envgraph does today, what it does not, and what is planned.

## Implemented

- CLI with commands: `scan`, `create example`, `create config`, `help`,
  `version`, and the default `envgraph` check.
- Project configuration via `envgraph.config.{ts,mts,js,mjs,cjs,json}`,
  discovered automatically (nearest wins) with upward search that stops at
  the project root; a broken config warns and falls back to defaults.
- AST-based detection of `process.env.NAME` and `process.env["NAME"]`
  (string literal) in `.js` / `.jsx` / `.ts` / `.tsx` files.
- Detection of environment loading: `import "dotenv/config"`,
  `dotenv.config()` (including static `path` options and
  `require("dotenv").config()`), and Node's `process.loadEnvFile()`.
- Discovery of `.env*` files by filename convention (contents never read).
- Grouped, sorted, line-accurate scan report on stdout; parse errors on
  stderr.
- `.env.example` generation from `.env` with name-based secret blanking,
  order/formatting preservation, `--force`, `--dry-run`, and a TTY-gated
  overwrite prompt. Configurable via the config file:
  `example.keepComments` and `example.defaults` (full per-key override).
- A dim stderr hint when running `scan` from a project subfolder.

## Not supported today

Scanning:

- Alias, destructured, or dynamic accesses (`e.PORT`, `const { PORT } =
  process.env`, `process.env[name]`) are not detected.
- Other globals such as `import.meta.env` are not scanned.
- No path filtering options, no custom include/exclude globs from the CLI.
- Only usage *locations* are reported вЂ” no values and no linking of a
  variable to the `.env` file that defines it (usage and loading are
  detected separately, but not yet correlated into a dependency graph).
- Loader detection is limited to the npm `dotenv` package and Node's native
  `process.loadEnvFile()`; other loaders (`dotenvx`, framework-specific
  loading, `env-cmd`, вЂ¦) are not recognized.
- Import resolution is specifier-based only: no path mapping, tsconfig
  aliases, or re-export tracking.

`.env` handling:

- No interpolation, multi-line values, or `export KEY=value`.
- The sanitizer is name-based and cannot detect secrets under benign names.
- Only `.env` в†’ `.env.example`; no other file formats.

## Not yet functional / future ideas

Do not rely on the following:

- **Loader graph** — usage and loading are detected separately, but not yet
  correlated into a dependency graph linking a variable to the `.env` file
  that defines it.
- **`analyzeProject`/`runEnvGraph`** exist and delegate to `scanProject`, but
  no further orchestration (formatting/output) is wired up yet.

There is no watch mode and no plugin system at this time.

There is no watch mode and no plugin system at this time.
