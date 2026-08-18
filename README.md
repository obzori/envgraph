# envgraph

A static analyzer that maps environment variables to the files that use them in
JavaScript and TypeScript projects.

> **Status:** foundation only. The CLI runs and prints `envgraph is ready.`, but
> the actual analysis is not implemented yet.

## Requirements

- Node.js **≥ 23.6** (uses native TypeScript type-stripping and the built-in
  test runner, so no extra runtime or test dependencies are required).

## Install

### From source (development)

```bash
# Clone the repo, then
npm install     # install dev dependencies (TypeScript)
npm run build   # compile src/ -> dist/
```

### As a global/local package

Once published, install it as a dev dependency:

```bash
npm install --save-dev envgraph
```

## Usage

Run it directly with `npx`:

```bash
npx envgraph            # prints: envgraph is ready.
npx envgraph --help     # show usage and available commands
npx envgraph --version  # show the installed version
```

Or via npm scripts in a project:

```json
{
  "scripts": {
    "envgraph": "envgraph"
  }
}
```

## Development scripts

| Script          | Description                                            |
| --------------- | ------------------------------------------------------ |
| `npm run build` | Compile TypeScript from `src/` to `dist/`.             |
| `npm run dev`   | Run the CLI in watch mode (restarts on change).        |
| `npm start`     | Run the CLI directly from source.                      |
| `npm test`      | Typecheck then run the unit tests.                     |
| `npm run typecheck` | Typecheck `src/` and `tests/` without emitting.    |

## Project layout

```
src/
  cli/          CLI entry point and subcommand definitions
    commands/   command registry (envgraph, help, version)
  core/         orchestration and run context
  analysis/     JS/TS AST parsing and process.env detection (future)
  filesystem/   project discovery and .env reading utilities
  config/       configuration defaults and loading (future)
  output/       json / table / mermaid formatters (future)
  index.ts      public package entry point
tests/          unit tests
```

## Planned features

- JavaScript/TypeScript AST parsing
- `process.env` and `import.meta.env` detection
- `.env` and `.env.example` parsing
- unused / missing variable detection
- dependency and file graphs
- JSON, table, and Mermaid output
- configuration files
- watch mode

## License

MIT
