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
envgraph scan          # scan the current directory
envgraph scan --help   # or -h: print usage, exit 0
```

Scans source files for statically detectable `process.env` accesses.
Details of discovery and syntax support are in [Scanning](scanning.md).

Output format:

- If nothing is found: `No environment variables found.` — exit `0`.
- Otherwise a summary line followed by one row per variable, sorted by name:

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
  `envgraph create: unknown or missing generator. Available: example` — exit `1`.
- No `.env` in the current directory:
  `envgraph: .env not found in <cwd>.` — exit `1`.
- `.env.example` exists:
  - Interactive terminal: prompts `.env.example already exists. Overwrite? [y/N]`
    — only `y`/`Y` overwrites; declining prints
    `envgraph: .env.example not modified.` — exit `0`.
  - Non-interactive (no TTY): refuses to overwrite — exit `1`.
- Success: writes the file and prints `✓ Created .env.example` plus the
  review warning — exit `0`.

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
