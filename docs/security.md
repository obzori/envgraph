# Security

envgraph is designed to be safe to run in any repository, but its secret
sanitizer has known limits. This page states precisely what it reads, writes,
and guarantees.

## What envgraph reads

- Source files under the working directory with extensions `.js`, `.jsx`,
  `.ts`, `.tsx` (excluding `node_modules`, `.git`, `dist`, `build`).
- Your `.env` file, when you run `envgraph create example`.

### NO NETWORK ACCESS! NO TELEMETRY! 
*go suck, microsoft*

## What envgraph writes

- Only one file ever: `.env.example`, in the working directory, and only when
  you explicitly run `create example` (and confirm, pass `--force`, or no
  file exists yet).

## What envgraph never executes

Your project's code is never executed or evaluated. Source files are only
parsed with the TypeScript compiler API; `.env` files are only parsed
line-by-line. There are zero runtime dependencies.

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
