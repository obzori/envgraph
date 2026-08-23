# Limitations

What envgraph does today, what it does not, and what is only a placeholder.

## Implemented

- CLI with commands: `scan`, `create example`, `help`, `version`, and the
  default `envgraph` check.
- AST-based detection of `process.env.NAME` and `process.env["NAME"]`
  (string literal) in `.js` / `.jsx` / `.ts` / `.tsx` files.
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
- Only usage *locations* are reported — no values, no cross-referencing
  against `.env` keys.

`.env` handling:

- No interpolation, multi-line values, or `export KEY=value`.
- The sanitizer is name-based and cannot detect secrets under benign names.
- Only `.env` → `.env.example`; no other file formats.

## Placeholders / future ideas (not yet functional)

The following exist in the codebase as scaffolding but are **not** usable
behavior. Do not rely on them:

- **Configuration files** (`envgraph.config.{js,ts,json}`) — `loadConfig`
  returns built-in defaults only; there is no config-file discovery or
  merging.
- **Output formats** — `formatOutput` defines `json`, `table`, and `mermaid`
  types, but all currently serialize to JSON; none are wired into the CLI.
- **Programmatic analysis API** — `analyzeProject` and `runEnvGraph` return an
  empty result; the working implementation is `scanProject` in
  `src/core/scanner/`. The public exports from `envgraph` are real but the
  orchestration layer is not implemented yet.
- **Column numbers** — declared in the analysis types but not produced by the
  scanner.

There is no config file, no JSON output flag, no watch mode, and no plugin
system at this time.
