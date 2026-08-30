# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Performance

- `check` reuses the scan result instead of walking the tree a second time
  to list `.env*` files — one full traversal less per run. Measured on a
  5,000-file fixture (best of 5): `runCheck` 103 ms → 98 ms.

## [1.1.2] - 2026-08-30

### Performance

- Source files that cannot contain a detected construct (none of them spell
  "env") skip parsing entirely — the parse phase shrinks in proportion to the
  env-free share of the codebase.
- The loader pre-pass is skipped for files without "dotenv"/"loadEnvFile"
  (one full AST walk less per file).

Measured on a 20,000-file fixture (best of 3): parse 609 → 515 ms (−15%),
full scan 1386 → 1259 ms (−9%). The gain scales with the env-free share of
the codebase — measured across real projects at 5–100% env-free bytes.

## [1.1.1] - 2026-08-30

### Performance

- **Lazy TypeScript loading** — the compiler API (~200 ms of module import
  time) is loaded on the first parse instead of at startup. The CLI shell
  never pays for it; worker threads that run the scan load it only when
  there is actual work to do.
- **Lazy command registry** — command modules are loaded via dynamic
  `import()` on first use. Help output renders from static registry
  metadata, so `--help` and `--version` never load a command's dependency
  graph.

Startup measured in-process (best of repeated runs, same machine):

- `envgraph --version`: 342 ms → 130 ms (**~2.6× faster**).
- `envgraph scan` on a 100-file project (startup-dominated): 580 ms → 335 ms.

End-to-end via `npx` (hyperfine, 10 runs, warmup 5; npx adds constant
overhead for both versions, so the ratio understates the in-process gain):

- `envgraph@1.1.0 --version`: 722.3 ± 151.8 ms
- `envgraph@1.1.1 --version`: 496.3 ± 26.2 ms (~1.46× faster, with a 6×
  smaller spread — the shorter startup path is also more stable)

[1.1.1]: [#9eb6cb0](https://github.com/obzori/envgraph/commit/9eb6cb071a7a01507e473bc537d204bd6d7e358b)
[1.1.2]: [#178ae81](https://github.com/obzori/envgraph/commit/178ae81fd45ab2f89529bebdb489cd89f97c10c1)
