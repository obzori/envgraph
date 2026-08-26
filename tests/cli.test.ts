import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { run } from "../src/cli/index.ts";

const pkgVersion = JSON.parse(
	readFileSync(path.resolve(import.meta.dirname, "../package.json"), "utf8"),
).version as string;

function capture(
	fn: () => Promise<number>,
): Promise<{ code: number; stdout: string; stderr: string }> {
	const outChunks: string[] = [];
	const errChunks: string[] = [];
	const origOut = process.stdout.write.bind(process.stdout);
	const origErr = process.stderr.write.bind(process.stderr);

	(process.stdout as unknown as { write: (c: unknown) => boolean }).write = (
		c: unknown,
	) => {
		outChunks.push(String(c));
		return true;
	};
	(process.stderr as unknown as { write: (c: unknown) => boolean }).write = (
		c: unknown,
	) => {
		errChunks.push(String(c));
		return true;
	};

	return fn()
		.then((code) => ({ code, stdout: outChunks.join(""), stderr: errChunks.join("") }))
		.finally(() => {
			process.stdout.write = origOut;
			process.stderr.write = origErr;
		});
}

// ── global flags ──────────────────────────────────────────────────────

test("default command (no args) prints ready message and exits 0", async () => {
	const { code, stdout } = await capture(() => run(["node", "envgraph"]));
	assert.equal(code, 0);
	assert.match(stdout, /envgraph is ready/);
});

test("--help prints usage and exits 0", async () => {
	const { code, stdout } = await capture(() => run(["node", "envgraph", "--help"]));
	assert.equal(code, 0);
	assert.match(stdout, /Usage:/);
	assert.match(stdout, /Commands/);
	assert.match(stdout, /scan/);
	assert.match(stdout, /check/);
	assert.match(stdout, /create/);
});

test("-h is equivalent to --help", async () => {
	const { code, stdout } = await capture(() => run(["node", "envgraph", "-h"]));
	assert.equal(code, 0);
	assert.match(stdout, /Usage:/);
});

test("--version prints version and exits 0", async () => {
	const { code, stdout } = await capture(() => run(["node", "envgraph", "--version"]));
	assert.equal(code, 0);
	assert.match(stdout, new RegExp(pkgVersion));
});

test("-v is equivalent to --version", async () => {
	const { code, stdout } = await capture(() => run(["node", "envgraph", "-v"]));
	assert.equal(code, 0);
	assert.match(stdout, new RegExp(pkgVersion));
});

test("unknown command prints error to stderr and exits 1", async () => {
	const { code, stderr } = await capture(() =>
		run(["node", "envgraph", "nonexistent"]),
	);
	assert.equal(code, 1);
	assert.match(stderr, /unknown command "nonexistent"/);
});

// ── subcommands ───────────────────────────────────────────────────────

test("`help` command prints usage and exits 0", async () => {
	const { code, stdout } = await capture(() => run(["node", "envgraph", "help"]));
	assert.equal(code, 0);
	assert.match(stdout, /Usage:/);
	assert.match(stdout, /Commands/);
});

test("`version` command prints version and exits 0", async () => {
	const { code, stdout } = await capture(() => run(["node", "envgraph", "version"]));
	assert.equal(code, 0);
	assert.match(stdout, new RegExp(pkgVersion));
});

test("`scan --help` prints scan usage and exits 0", async () => {
	const { code, stdout } = await capture(() =>
		run(["node", "envgraph", "scan", "--help"]),
	);
	assert.equal(code, 0);
	assert.match(stdout, /envgraph scan/);
	assert.match(stdout, /--force/);
	assert.match(stdout, /--format/);
});

test("`check --help` prints check usage and exits 0", async () => {
	const { code, stdout } = await capture(() =>
		run(["node", "envgraph", "check", "--help"]),
	);
	assert.equal(code, 0);
	assert.match(stdout, /envgraph check/);
	assert.match(stdout, /--format/);
});

test("`create --help` prints create usage and exits 0", async () => {
	const { code, stdout } = await capture(() =>
		run(["node", "envgraph", "create", "--help"]),
	);
	assert.equal(code, 0);
	assert.match(stdout, /envgraph create/);
	assert.match(stdout, /--force/);
	assert.match(stdout, /--dry-run/);
});

test("`scan -h` is equivalent to `scan --help`", async () => {
	const { code, stdout } = await capture(() =>
		run(["node", "envgraph", "scan", "-h"]),
	);
	assert.equal(code, 0);
	assert.match(stdout, /envgraph scan/);
});

// ── --minimal flag ────────────────────────────────────────────────────

test("--minimal flag is accepted without error", async () => {
	const { code } = await capture(() =>
		run(["node", "envgraph", "--minimal"]),
	);
	assert.equal(code, 0);
});

test("--minimal works with subcommands", async () => {
	const { code, stdout } = await capture(() =>
		run(["node", "envgraph", "--minimal", "scan", "--help"]),
	);
	assert.equal(code, 0);
	assert.match(stdout, /envgraph scan/);
});

// ── create with missing subcommand ────────────────────────────────────

test("`create` without subcommand exits 1 with error", async () => {
	const { code, stderr } = await capture(() =>
		run(["node", "envgraph", "create"]),
	);
	assert.equal(code, 1);
	assert.match(stderr, /unknown or missing generator/);
});
