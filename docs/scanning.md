# Scanning

How `envgraph scan` discovers files and detects `process.env` usages.

## File discovery

- Scans the current working directory recursively (synchronous directory walk).
- Includes only these extensions: `.js`, `.jsx`, `.ts`, `.tsx`.
- Skips these directories entirely: `node_modules`, `.git`, `dist`, `build`.
- Unreadable directories are silently skipped.
- Files are processed in sorted path order (forward slashes in reported paths).

## Supported syntax

Detection is **AST-based**, using the TypeScript compiler API — not regex —
so only genuine accesses are reported. Every file is parsed as TypeScript
(`ScriptKind.TS` with the latest language target), which also parses
JavaScript.

Detected forms:

| Form | Example |
| --- | --- |
| Dot notation | `process.env.PORT` |
| Bracket notation with a string literal | `process.env["PORT"]`, `process.env['PORT']` |

Only exact `process.env` receiver expressions match. Not detected:

- Aliases, e.g. `const e = process.env; e.PORT`.
- Destructuring, e.g. `const { PORT } = process.env`.
- Dynamic bracket access, e.g. `process.env[name]`.
- Other globals such as `import.meta.env`.

## Grouping and output

All accesses of a variable are grouped into one entry with every location;
variables are sorted by name. Locations use paths relative to the scan root
and 1-based line numbers. Example:

```text
4 usages · 2 variables

LOG_LEVEL  src/app.ts:4
PORT       src/app.ts:1 ×3
```

The first location is shown per variable; additional locations are counted in
the `×N` suffix. See [CLI Reference](cli.md) for the full output contract and
exit codes.

## Parse errors

If a file cannot be read or parsed, scanning continues with the remaining
files. Errors are collected and printed to stderr after the report as:

```text
envgraph scan: could not parse <file>: <message>
```

Error messages never include source text. The exit code stays `0`.

## Large directories

Before reading any source file, `envgraph scan` runs a cheap size check: it
counts directory entries (files + folders, excluding `node_modules`, `.git`,
`dist`, `build`) and stops counting as soon as the tree exceeds 50 000
entries (`DIRECTORY_ENTRY_LIMIT` in `src/cli/commands/scan.ts`).

- Over the limit without `--force`: the scan is **refused** with exit code `1`
  and a hint to run from a project root or pass `--force`.
- Over the limit with `--force`: it prints
  `⚠ Scanning a large directory: this may take a while...` and proceeds.
- Additionally, if more than 10 000 source files are discovered during the
  walk, a second notice is printed mid-walk:

```text
⚠ Scanning a large directory: 12345 source files
This may take a while...
```

The notice goes to stdout before any results; the scan then proceeds as usual.

## Examples

```bash
envgraph scan                 # scan the project in the current directory
envgraph scan --force         # scan even a very large directory
envgraph scan --help          # usage: "Usage: envgraph scan [--force]"
```
