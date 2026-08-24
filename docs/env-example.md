# .env.example Generation

How `envgraph create example` turns your `.env` into a `.env.example`.

## Usage

```bash
envgraph create example [--force] [--dry-run]
# short forms: -f (force), -d (dry-run)
```

Both `.env` and the generated `.env.example` live in the current working
directory.

## Config overrides

Generation can be customized via the project's
`envgraph.config.{js,mjs,cjs,ts,mts,json}` (`example` section):

```js
export default {
  example: {
    // keep comment lines from .env (default: true)
    keepComments: false,
    // write these values instead of whatever .env contains;
    // full override — wins even over sensitive-name sanitization
    defaults: {
      DISCORD_TOKEN: "enter_here_your_discord_token",
      NODE_ENV: "development",
    },
  },
};
```

Priority per assignment:

1. key present in `defaults` → value from `defaults`;
2. otherwise a sensitive-looking name → empty value;
3. otherwise the original `.env` value.

## How `.env` is parsed

The file is parsed line by line, in order:

- **Blank lines** are preserved.
- **Comment lines** starting with `#` or `;` are preserved verbatim.
- **Assignments** `KEY=value`: split on the *first* `=`, so values may contain
  `=`. Empty values (`KEY=`) are supported. Quotes are kept as part of the
  value text.
- **Raw lines** without `=` are kept verbatim, so unexpected content is never
  silently dropped.

Order is fully preserved so the generated file mirrors the source layout.
Output always ends with exactly one trailing newline.

## Sanitization

A variable is considered sensitive when its name contains (case-insensitively)
one of the patterns listed on the [Security](security.md) page. Sensitive
values are replaced with an empty value — the key stays as documentation:

```dotenv
PORT=3000
GREETING="Hello, world!"
STRIPE_SECRET=
DB_PASSWORD=
```

Non-sensitive values are preserved verbatim; secret-looking values are blanked
but their keys remain. This is a heuristic — see
[Security](security.md#limitations-of-the-sanitizer).

Not supported: variable interpolation (`PATH=${OTHER}/bin` stays literal
text), multi-line values, and `export KEY=value` (parsed as key `export KEY`).

## Overwriting behavior

- If `.env.example` does not exist, it is written directly.
- If it exists:
  - **Interactive terminal**: prompts
    `.env.example already exists. Overwrite? [y/N]`. Only `y`/`Y` overwrites;
    anything else leaves the file untouched (`envgraph: .env.example not
    modified.`, exit `0`).
  - **Non-interactive (CI)**: refuses to overwrite with exit `1`.
- `--force` (`-f`) overwrites without asking.

## Dry run

`--dry-run` (`-d`) prints what would be written instead of touching disk:

```text
Dry run: .env.example would contain:

PORT=3000
DB_PASSWORD=

IMPORTANT: CHECK .env.example BEFORE COMMITTING IT.
Make sure it does not contain passwords, tokens, API keys,
private keys, credentials, or other sensitive information.
```

Exit code is still `0`, and no file is created.

## CI-safe usage

In CI, stdin is not a TTY, so `create example` never prompts: it either writes
a new file or fails with exit `1` if `.env.example` already exists.

```bash
envgraph create example --dry-run   # review output in the CI log
envgraph create example --force     # write deterministically
```
