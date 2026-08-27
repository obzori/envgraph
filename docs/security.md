# Security

envgraph is designed to be safe to run in any repository, but its secret
sanitizer has known limits. This page states precisely what it reads, writes,
and guarantees.

## What envgraph reads

- Source files under the working directory with extensions `.js`, `.jsx`,
  `.ts`, `.tsx` (excluding `node_modules`, `.git`, `dist`, `build`) — parsed
  as AST only.
- Your `.env` file, when you run `envgraph create example`.
- During `scan`: `.env*` **filenames only** (`.env`, `.env.local`, …) — file
  contents are never read and values never enter the output.

### No network access, no telemetry

envgraph never makes network requests and collects no telemetry data.

## What envgraph writes

- Only one file ever: `.env.example`, in the working directory, and only when
  you explicitly run `create example` (and confirm, pass `--force`, or no
  file exists yet).

## What envgraph never executes

Code of your project is never executed or evaluated. Source files are only
parsed with the TypeScript compiler API; `.env` files are only parsed
line-by-line.

## The config file exception

There is exactly one exception: your `envgraph.config.{js,ts,mjs,cjs}` is a
**JavaScript/TypeScript file and is executed** to read its exports. This is the
same model as ESLint (`eslint.config.js`), Prettier (`prettier.config.js`), or
any other JS tool — a config file sync with the tool format must be code.

This means:

- The config is trusted input. Whoever can write `envgraph.config.js` in a
  project can already write to `package.json` (whose lifecycle scripts run on
  every `npm install`), any source file, or `.npmrc` — so the config file adds
  no achievable attack vector on your own machine.
- Constructing an `envgraph.config.*` that moves data off the machine would
  require the attacker to have write access to the repository, which already
  implies full compromise. envgraph itself never opens a network connection.
- For the CJS-in-ESM case the config source is evaluated directly (via a
  `data:` import and a `vm` fallback). A `vm` context is **not** a security
  boundary — it is only an evaluation mechanism, and it must not be treated
  as one.

Where you run envgraph on repositories you do not trust (e.g. scanning an
unvetted clone in CI), the config executes too. The safe pattern is the same
as for any external code: run it in a disposable, isolated environment
(container / ephemeral CI runner), do not run it on your working machine.

## The secret-name heuristic

Sensitive variables are detected purely by **name**: a variable whose name
contains, case-insensitively, one of these substrings is blanked in
`.env.example`:

`PASSWORD`, `PASS`, `SECRET`, `TOKEN`, `API_KEY`, `APIKEY`, `PRIVATE_KEY`,
`ACCESS_KEY`, `CLIENT_SECRET`, `AUTH_TOKEN`, `DATABASE_URL`, `DATABASE_URI`

Generic substrings like `URL`, `KEY`, or `ID` alone are deliberately *not*
patterns — e.g. `API_URL` is kept even though it contains `URL`.

## Limitations of the sanitizer

- It inspects **names only**, never values. A secret stored under a benign
  name (e.g. `APP_CONFIG`) will be copied verbatim into `.env.example`.
- Conversely, harmless variables may be blanked (e.g. `TOKEN_BUCKET_SIZE`).
- New kinds of credential names are not recognized until their pattern is
  added to the list.

**Therefore: always review `.env.example` before committing it.** envgraph
prints this warning after every successful generation:

```text
IMPORTANT: CHECK .env.example BEFORE COMMITTING IT.
Make sure it does not contain passwords, tokens, API keys,
private keys, credentials, or other sensitive information.
```

The sanitizer reduces risk; it does **not** guarantee that secrets are
removed.
