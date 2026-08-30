# Development

## Repository structure

```text
src/
├── index.ts            # public package entry point (re-exports below)
├── cli/
│   ├── index.ts        # CLI dispatch, global flags (--minimal), bin script
│   ├── ui.ts           # shared UI primitives: rule(), section(), banner()
│   ├── spinner.ts      # simpleDotsScrolling progress animation (TTY only)
│   ├── offload.ts      # run a pure fn in a worker thread (keeps spinner alive)
│   ├── prompt.ts       # minimal synchronous y/N confirmation
│   ├── style.ts        # chalk color helpers
│   └── commands/       # one folder-command per subcommand + registry (index.ts)
├── core/
│   ├── scanner/        # source-file scanning: ast.ts, scanner.ts
│   └── env/            # .env parser, secret sanitizer, example generator
├── analysis/           # programmatic analysis API (scaffold, see limitations.md)
├── config/
│   ├── defaults.ts     # types + DEFAULT_CONFIG + merge helpers
│   ├── loader.ts       # envgraph.config discovery, loading, cache
│   └── index.ts        # re-exports (single import path for consumers)
├── output/             # output formatting (json, table, mermaid)
└── filesystem/         # file discovery and .env reading helpers
tests/                  # node:test suites (cli, check, create, scan, …)
dist/                   # build output (published to npm)
```

## Setup

Requirements:

- Node.js **>= 22** (for development, native TypeScript type-stripping is
  used to run `src/*.ts` directly).
- npm.

```bash
npm install
```

Runtime dependencies: `chalk` (terminal colors) and `typescript` (AST parsing).
Dev dependencies: `@types/node`.

## npm scripts

| Script | What it does |
| --- | --- |
| `npm run build` | Compile TypeScript (`tsc`) into `dist/`. |
| `npm run typecheck` | Typecheck the project including tests (`tsconfig.test.json`). |
| `npm test` | Run typecheck, then the test suite via `node --test "tests/**/*.test.ts"`. |
| `npm start` | Run the CLI from source (`node src/cli/index.ts`). |
| `npm run dev` | Run the CLI from source with file watching. |
| `npm run clean` | Delete the `dist/` directory. |
| `npm run prepublishOnly` | Clean, build, and test (runs automatically on publish). |

Try the CLI locally against a scratch project:

```bash
npm start -- scan
npm start -- create example --dry-run
```

## Testing

Tests use the built-in [`node:test`](https://nodejs.org/api/test.html) runner
— no test framework dependency. Suites live in `tests/`:

- `cli.test.ts` — CLI dispatch, help/version, unknown commands.
- `scan.test.ts` — file discovery, AST detection, grouping, error handling.
- `check.test.ts` — .env vs usage comparison (missing/unused/duplicate).
- `create.test.ts` — `.env` parsing, sanitization, generation, flags,
  overwrite behavior.
- `create-config.test.ts` — config discovery, merging, themes, hasConfigKey.
- `envfiles.test.ts`, `loaders.test.ts`, `output.test.ts` — core building blocks.

The core command logic is written as pure functions (e.g. `runScan`,
`runCheck`, `createExample`) that return outcomes instead of writing to
process streams, so tests do not need stream capture. Keep new code following
this pattern; wrappers that touch real process state are intentionally thin
and hard to test, so put logic in the pure functions.

Run a single suite:

```bash
node --test tests/create.test.ts
```

## Contributing

1. Open or comment on an [issue](https://github.com/obzori/envgraph/issues)
   describing the change.
2. Fork / branch, make your change with tests.
3. Ensure `npm test` passes and `npm run build` compiles cleanly.
4. Open a pull request describing the change.

Keep changes consistent with the existing style: tabs for indentation,
JSDoc comments on exported functions, and pure-function cores with thin CLI
wrappers. UI decoration (rules/banners) belongs in `ui.ts`; per-command
presentation should reuse `ui.ts` primitives rather than reinventing them.

## Command architecture

Each subcommand is split into tiny, single-purpose modules so a change lands
in one file instead of a large command:

- `<name>.ts` — the command wrapper (implements `EnvGraphCommand`): handles
  the banner, the spinner, and printing, then re-exports the pieces so
  existing imports keep working.
- `<name>-flags.ts` — argument parsing (`--format`, `-o`, `--force`, …).
- `<name>-run.ts` — the pure entry point (`runScan`, `runCheck`) that returns
  an outcome. This is what the tests import.
- `<name>-report.ts` / `<name>-issues.ts` — pure rendering / analysis logic.
- `<name>-config.ts` / `<name>-example.ts` — generator logic for `create`.
- `<name>-guard.ts` — shared side-effects-free guards (e.g. the large-directory
  limit shared by `scan` and `check`).

### Conventions

1. **Logic is pure and testable** — functions take plain args and return
   `Outcome` objects (`{ exitCode, stdout, stderr, … }`); they never touch
   `process.stdout`/`stderr`.
2. **Wrappers are thin** — the `run()` in `scan.ts`/`check.ts` prints the
   banner, animates the spinner (off-thread), and writes the outcome lines.
   Keep this layer minimal.
3. **Re-export from the wrapper** — `scan.ts` re-exports `runScan`,
   `parseScanFlags`, `DIRECTORY_ENTRY_LIMIT` and types so tests and other
   modules keep a stable import path.
4. **`ui` theme stays centralized** — `rule()`/`section()`/`banner()` read the
   current theme from the config, so `ui: "minimal"` and the global
   `--minimal` flag work everywhere without per-command code.
5. **Heavy work off-thread** — `offload.ts` runs a pure function in a worker
   thread so the spinner in the main thread keeps animating; `scan` additionally
   splits its per-file parse across a worker pool (`core/scanner/parallel.ts`),
   which parallelizes the CPU-bound analysis instead of serializing it.

## Adding a CLI command

Commands follow the split-module pattern (see "Command architecture"). The
minimal shape is a wrapper plus a pure run function:

1. Create the pure logic, e.g. `src/cli/commands/mycommand-run.ts`:

   ```ts
   export interface MyOutcome {
     exitCode: number;
     stdout: string[];
     stderr: string[];
   }

   export function runMyCommand(args: string[], cwd: string): MyOutcome {
     // pure: no process.* writes — return lines
     return { exitCode: 0, stdout: ["done"], stderr: [] };
   }
   ```

2. Create the wrapper `src/cli/commands/mycommand.ts` implementing
   `EnvGraphCommand`, then re-export the pure function:

   ```ts
   import type { EnvGraphCommand } from "./types.ts";
   import { banner, rule } from "../ui.ts";
   import { runMyCommand } from "./mycommand-run.ts";

   export { runMyCommand } from "./mycommand-run.ts";
   export type { MyOutcome } from "./mycommand-run.ts";

   export const myCommand: EnvGraphCommand = {
     name: "mycommand",
     description: "One-line description shown in help.",
     usage: "envgraph mycommand",
     async run(args) {
       const cwd = process.cwd();
       const outcome = runMyCommand(args, cwd); // or in a worker for heavy work
       for (const line of banner("envgraph mycommand")) process.stdout.write(line + "\n");
       for (const line of outcome.stdout) process.stdout.write(line + "\n");
       for (const line of outcome.stderr) process.stderr.write(line + "\n");
       return outcome.exitCode;
     },
   };
   ```

3. Register it in `src/cli/commands/index.ts` by appending an entry to the
   registry. Order determines help-output order; help text updates
   automatically. The entry carries the static metadata — help renders
   without loading the module — plus a lazy loader:

   ```ts
   {
     name: "mycommand",
     description: "One-line description shown in help.",
     usage: "envgraph mycommand",
     load: () => import("./mycommand.ts").then((m) => m.myCommand),
   },
   ```

   Command modules load on first use, so `--help` and `--version` never pay
   for a command's dependency graph (the scanner loads the TypeScript
   compiler API only when a parse actually happens).
4. Add tests in `tests/` (e.g. `tests/mycommand.test.ts`) against
   `runMyCommand` — not the wrapper.

Keep heavy lifting in pure functions that return lines/outcomes, with the
command's `run()` only printing — this stays unit-testable like `runScan` and
`createExample`. For long-running commands use `runInWorker` + `Spinner` to
keep the UI responsive.
