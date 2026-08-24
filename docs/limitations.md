# Limitations

What envgraph does today, what it does not, and what is only a placeholder.

## Implemented

- CLI with commands: `scan`, `create example`, `help`, `version`, and the
  default `envgraph` check.
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
  overwrite prompt.

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

## Placeholders / future ideas (not yet functional)

The following exist in the codebase as scaffolding but are **not** usable
behavior. Do not rely on them:

- **Configuration files** (`envgraph.config.{js,ts,json}`) вЂ” `loadConfig`
  returns built-in defaults only; there is no config-file discovery or
  merging.
- **Output formats** — `json`, `table`, and `mermaid` are implemented in
  `src/output/index.ts` and available via
  `envgraph scan --format json|table|mermaid`, with optional file export via
  `--output <file>` / `-o <file>`.
- **Programmatic analysis API** вЂ” `analyzeProject` and `runEnvGraph` return an
  empty result; the working implementation is `scanProject` in
  `src/core/scanner/`. The public exports from `envgraph` are real but the
  orchestration layer is not implemented yet.
- **Column numbers** вЂ” declared in the analysis types but not produced by the
  scanner.

There is no config file, no JSON output flag, no watch mode, and no plugin
system at this time.
