# Scanning

How `envgraph scan` discovers files and analyzes environment usage.

envgraph separates two concepts:

- **Environment variable usage** — e.g. `process.env.PORT`.
- **Environment loading** — e.g. `dotenv.config()` or
  `process.loadEnvFile(".env")`.

Both are reported with exact locations. Values from `.env` files are never
read or printed — only names, paths, and line numbers.

## File discovery

- Scans the current working directory recursively (synchronous directory walk).
- Includes only these extensions: `.js`, `.jsx`, `.ts`, `.tsx`.
- Skips these directories entirely: `node_modules`, `.git`, `dist`, `build`.
- Unreadable directories are silently skipped.
- Files are processed in sorted path order (forward slashes in reported paths).
- The `include` and `exclude` config keys accept glob patterns (`*`, `**`, `?`,
  `{a,b}`) to narrow the set of scanned files. Without them, all matching
  extensions are scanned.

## Supported syntax

Detection is **AST-based**, using the TypeScript compiler API — not regex —
so only genuine accesses are reported. Every file is parsed as TypeScript
(`ScriptKind.TS` with the latest language target), which also parses
JavaScript.

### Environment variable access

| Form | Example | Runtime |
| --- | --- | --- |
| Dot notation | `process.env.PORT` | Node.js |
| Bracket notation with a string literal | `process.env["PORT"]` | Node.js |
| Destructuring | `const { PORT } = process.env` | Node.js |
| Destructuring with rename | `const { PORT: port } = process.env` | Node.js |
| Dot notation | `import.meta.env.MODE` | Vite |
| Bracket notation with a string literal | `import.meta.env["MODE"]` | Vite |
| Destructuring | `const { MODE } = import.meta.env` | Vite |
| Dot notation | `Bun.env.PORT` | Bun |
| Bracket notation with a string literal | `Bun.env["PORT"]` | Bun |
| Destructuring | `const { PORT } = Bun.env` | Bun |
| `Deno.env.get("NAME")` with a string literal | `Deno.env.get("PORT")` | Deno |

Rest elements (`...rest`) and computed/dynamic keys in destructuring are
skipped — only statically resolvable names are reported.

Not detected:

- Aliases, e.g. `const e = process.env; e.PORT`.
- Dynamic bracket access, e.g. `process.env[name]`.
- `Deno.env.get(variable)` where the argument is not a string literal.

## Environment loader detection

Detection is AST-based, so string literals (`"dotenv.config()"`) and comments
never match. Local modules or variables named `dotenv` that shadow the npm
package are correctly ignored.

Recognized dotenv forms:

| Form | Reported env file |
| --- | --- |
| `import "dotenv/config";` | — (default) |
| `dotenv.config()` | — (default) |
| `require("dotenv").config()` | — (default) |
| `import dotenv from "dotenv";` + `dotenv.config();` | — (default) |
| `import * as dotenv from "dotenv";` + `dotenv.config();` | — (default) |
| `const dotenv = require("dotenv");` + `dotenv.config();` | — (default) |
| `dotenv.config({ path: ".env.local" })` | `.env.local` |

If `path` is not a string literal (e.g. `process.env.ENV_FILE`), the loader is
still reported but without a target file — values are never evaluated.

Recognized Node.js native API:

| Form | Reported env file |
| --- | --- |
| `process.loadEnvFile()` | — (default) |
| `process.loadEnvFile(".env")` / `(".env.local")` | the literal path |

Import resolution is deliberately simple: only the bare specifiers `"dotenv"`
and `"dotenv/config"` count as the npm package. A local module
(`import dotenv from "./dotenv"`) is never reported, and a local object or
variable named `dotenv` in the same file shadows the package name.

## .env file discovery

Files matching the common convention are reported: exactly `.env` or names
starting with `.env.` (`.env.local`, `.env.production`, `.env.example`,
`.env.development.local`, …). Names like `.environment`, `env.txt`, or
`something.env.backup` do **not** match. Only filenames are inspected — file
contents are never read during scanning.

## Grouping and output

All accesses of a variable are grouped into one entry with every location;
variables are sorted by name. Locations use paths relative to the scan root
and 1-based line numbers. Example without loaders:

```text
4 usages · 2 variables

LOG_LEVEL  src/app.ts:4
PORT       src/app.ts:1 ×3
```

When loaders or `.env` files are found, the summary gains a loader count and
two extra blocks (printed only when non-empty):

```text
1 usages · 1 variables
1 env loaders

PORT  src/config.ts:1

Environment loaders

dotenv  src/index.ts:1
dotenv  src/config.ts:4 → .env.local
node-load-env-file  src/boot.js:2 → .env

.env files

.env
.env.local
```

The classic format is unchanged when nothing but `process.env` accesses are
found. The first location is shown per variable; additional locations are
counted in the `×N` suffix. See [CLI Reference](cli.md) for the full output
contract and exit codes.

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
