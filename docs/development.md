# Development

## Repository structure

```text
src/
├── index.ts            # public package entry point (re-exports below)
├── cli/
│   ├── index.ts        # CLI entry point: arg parsing, dispatch, bin script
│   ├── prompt.ts       # minimal synchronous y/N confirmation
│   └── commands/       # one module per subcommand + registry (index.ts)
├── core/
│   ├── scanner/        # source-file scanning: ast.ts, scanner.ts
│   └── env/            # .env parser, secret sanitizer, example generator
├── analysis/           # programmatic analysis API (scaffold, see limitations.md)
├── config/             # envgraph.config discovery, loading and merging
├── output/             # output formatting (json, table, mermaid)
└── filesystem/         # file discovery and .env reading helpers
tests/                  # node:test suites (cli, create, create-config, scan, …)
dist/                   # build output (published to npm)
```

## Setup

Requirements:

- Node.js **>= 23.6.0** (the codebase uses native TypeScript type-stripping —
  no transpiler is needed to run `src/*.ts` directly).
- npm.

```bash
npm install
```

There are no runtime dependencies; dev dependencies are `typescript` and
`@types/node` only.

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
- `create.test.ts` — `.env` parsing, sanitization, generation, flags,
  overwrite behavior.

The core command logic is written as pure functions (e.g. `runScan`,
`createExample`) that return outcomes instead of writing to process streams,
so tests do not need stream capture. Keep new code following this pattern.

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
wrappers.

## Adding a CLI command

1. Create a module in `src/cli/commands/`, e.g. `mycommand.ts`.
2. Implement the `EnvGraphCommand` interface:

   ```ts
   import type { EnvGraphCommand } from "./types.ts";

   export const myCommand: EnvGraphCommand = {
     name: "mycommand",
     description: "One-line description shown in help.",
     usage: "envgraph mycommand",
     run(args) {
       // args are everything after the command name
       args.includes("--flag")
       return 0; // process exit code
     },
   };
   ```

3. Register it in `src/cli/commands/index.ts` by appending it to the
   `commands` array. Order determines help-output order; help text updates
   automatically.
4. Add tests in `tests/cli.test.ts`.

Prefer implementing the heavy lifting as a pure function that returns lines /
outcomes, with the command's `run()` doing the printing — this keeps it
unit-testable like `runScan` and `createExample`.
