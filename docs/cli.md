# CLI Reference

All commands operate on the current working directory. Exit code `0` means
success; anything else is an error.

## Global behavior

- `envgraph` (no arguments) runs the default command and prints
  `envgraph is ready.` — exits `0`.
- `envgraph -h` / `envgraph --help` prints general help — exits `0`.
- `envgraph -v` / `envgraph --version` prints the installed version, resolved
  from the package's `package.json`, e.g. `envgraph v0.3.0` — exits `0`.
- Unknown commands print `envgraph: unknown command "<name>".` followed by the
  general help — exit `1`.

General help output:

### Configuration file

On every run envgraph looks for a config file in the current directory and
loads it automatically:

`envgraph.config.ts`, `envgraph.config.mts`, `envgraph.config.mjs`,
`envgraph.config.mjs`, `envgraph.config.cjs`, or `envgraph.config.json`
(first match wins). Generate one with `envgraph create config`.

Recognized keys (all optional, merged over defaults):

```js
export default {
  example: {
    keepComments: true,              // keep .env comments in .env.example
    defaults: {                      // full per-key override of the value
      DISCORD_TOKEN: "enter_here_your_discord_token",
    },
  },
};
```

`defaults` wins even over sensitive-name sanitization: if a key is listed
there, its value from `defaults` is written verbatim.

A config file that fails to load produces a warning on stderr and the run
continues with the default configuration. The search walks upward from the
current directory and stops at the project root (`.git`, `package.json`, …),
so running from a subfolder still finds it; envgraph prints a hint when the
loaded config lies above the working directory.

## `envgraph scan`


```text
envgraph — map environment variables to the files that use them.

Usage:
  envgraph [command] [options]

Commands:
  envgraph   Check that envgraph is installed and working.
  create     Generate scaffold files (e.g. .env.example from .env).
  scan       Detect process.env usages in the project's source files.
  help       Show usage information.
  version    Print the installed version.

Options:
  -h, --help     Show this help message.
  -v, --version  Print the installed version.
```

## `envgraph scan`

```bash
envgraph scan [--force] [--format json|table|mermaid] [-o <file>]
envgraph scan --help   # or -h: print usage, exit 0
```

Scans source files for environment variable usage (`process.env.*`),
environment loading mechanisms (dotenv, `process.loadEnvFile`), and `.env*`
files. Details in [Scanning](scanning.md).

Options:

| Option | Short | Effect |
| --- | --- | --- |
| `--force` | `-f` | Scan even if the directory looks too large (see below). |
| `--help` | `-h` | Print usage — exit `0`. |
| `--format <fmt>` | `-F` | Output format: `json`, `table`, or `mermaid`. Also accepted as `--format=<fmt>`. |
| `--output <file>` | `-o` | Write the formatted output to a file instead of stdout (parent directories are created). Also accepted as `--output=<file>`. |

### Output formats

- **default** (no `--format`): human-readable, colorized terminal report.
- **`json`**: machine-readable object with `variables`, `loaders`,
  `envFiles`, and `errors`.
- **`table`**: plain-text aligned table (no ANSI colors).
- **`mermaid`**: a `flowchart LR` graph where `.env*` files feed loaders
  and variables link to their usage sites; paste directly into Mermaid-enabled
  Markdown.

Examples:

```bash
envgraph scan --format json > report.json
envgraph scan --format mermaid -o docs/env-graph.mmd
```


### Large-directory guard

Before reading anything, envgraph counts directory entries (files + folders,
excluding `node_modules`, `.git`, `dist`, `build`). The count stops early once
it exceeds 50 000 (`DIRECTORY_ENTRY_LIMIT` in
`src/cli/commands/scan.ts`), so the check is fast even in huge trees.

- Over the limit **without** `--force`: nothing is scanned; a message is
  printed to stderr and the exit code is `1`:

  ```text
  envgraph scan: directory <root> is too large to scan (more than 50000 entries).
  Run from a project root instead, or pass --force to scan anyway.
  ```

- Over the limit **with** `--force` (`-f`): a warning is printed first and
  the scan proceeds:

  ```text
  ⚠ Scanning a large directory: this may take a while...
  ```

Output format:

- If the directory contains more than 10 000 source files, a warning is
  printed before parsing starts:

```text
⚠ Scanning a large directory: 12345 source files
This may take a while...
```

- If nothing is found: `No environment variables found.` — exit `0`.
- Otherwise a summary line (plus a loader count when loaders exist), one row
  per variable sorted by name, and — only when present — `Environment
  loaders` and `.env files` blocks:

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

Without loaders or `.env` files the output is just the classic format:

```text
4 usages · 2 variables

LOG_LEVEL  src/app.ts:4
PORT       src/app.ts:1 ×3
```

Each row shows the variable name, its first location (`file:line`, relative
path with 1-based line), and a `×N` suffix when there is more than one usage.
Parse errors go to stderr as
`envgraph scan: could not parse <file>: <message>` but do not change the exit
code.

Exit codes: always `0` for scans within the current implementation, even when
some files fail to parse.

## `envgraph create example`

```bash
envgraph create example [--force] [--dry-run]
```

Generates `.env.example` from `.env`. See
[.env.example Generation](env-example.md) for parsing, sanitization, and
examples.

Options:

| Option | Short | Effect |
| --- | --- | --- |
| `--force` | `-f` | Overwrite an existing `.env.example` without asking. |
| `--dry-run` | `-d` | Print the generated content without writing any file. |
| `--help` | `-h` | Print usage: `Usage: envgraph create example [--force] [--dry-run]` — exit `0`. |

Behavior:

- Missing or wrong generator name (anything other than `example`):
  `envgraph create: unknown or missing generator. Available: example, config` — exit `1`.
- No `.env` in the current directory:
  `envgraph: .env not found in <cwd>.` — exit `1`.
- `.env.example` exists:
  - Interactive terminal: prompts `.env.example already exists. Overwrite? [y/N]`
    — only `y`/`Y` overwrites; declining prints
    `envgraph: .env.example not modified.` — exit `0`.
  - Non-interactive (no TTY): refuses to overwrite — exit `1`.
- Success: writes the file and prints `✓ Created .env.example` plus the
  review warning — exit `0`.

## `envgraph create config`

```bash
envgraph create config [--force] [--dry-run] [--ts|--js]
```

Generates an `envgraph.config.ts` (TypeScript projects) or `envgraph.config.mjs`
(JavaScript projects) in the current directory with a commented starter
template. The project language is detected from `tsconfig.json` or root
`.ts`/`.mts` files; `--ts` / `--js` override detection.

Options:

| Option | Short | Effect |
| --- | --- | --- |
| `--force` | `-f` | Overwrite an existing config file without asking. |
| `--dry-run` | `-d` | Print the generated content without writing any file. |
| `--ts` / `--js` | | Force the output file type. |
| `--help` | `-h` | Print usage — exit `0`. |

Behavior mirrors `create example`: without `--force`, an existing config file
is only overwritten after interactive confirmation (non-interactive runs
refuse, exit `1`). Success prints `✓ Created <file>` (or `✓ Overwrote`) —
exit `0`.

## `envgraph help`

```bash
envgraph help
```

Prints the general usage text shown above — exit `0`. Equivalent to
`envgraph --help`.

## `envgraph version`

```bash
envgraph version
```

Prints `envgraph v<version>` resolved from the package's `package.json` —
exit `0`. Equivalent to `envgraph --version`.
