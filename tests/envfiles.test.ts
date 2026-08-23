import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { scanProject } from "../src/core/scanner/scanner.ts";
import { runScan } from "../src/cli/commands/scan.ts";

function withProject(
	files: Record<string, string>,
	fn: (root: string) => void,
): void {
	const root = mkdtempSync(path.join(tmpdir(), "envgraph-envfiles-test-"));
	for (const [name, content] of Object.entries(files)) {
		const full = path.join(root, name);
		mkdirSync(path.dirname(full), { recursive: true });
		writeFileSync(full, content, "utf8");
	}
	try {
		fn(root);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

test(".env* files are discovered; unrelated names are not", () => {
	withProject(
		{
			".env": "PORT=3000\n",
			".env.local": "PORT=4000\n",
			".env.development.local": "",
			".env.example": "PORT=\n",
			".environment": "SHOULD_NOT_MATCH=1\n",
			"docs/env.txt": "SHOULD_NOT_MATCH=2\n",
			"config/something.env.backup": "SHOULD_NOT_MATCH=3\n",
		},
		(root) => {
			const result = scanProject(root);
			assert.deepEqual(result.envFiles, [
				".env",
				".env.development.local",
				".env.example",
				".env.local",
			]);
		},
	);
});

test(".env values never appear in scan output", () => {
	withProject(
		{
			".env": "DATABASE_URL=super-secret-value\nJWT_SECRET=abcdef123456\n",
			"src/auth.ts": [
				'import "dotenv/config";',
				"const db = process.env.DATABASE_URL;",
				"const jwt = process.env.JWT_SECRET;",
			].join("\n"),
		},
		(root) => {
			const outcome = runScan([], root);
			const all = [...outcome.stdout, ...outcome.stderr].join("\n");
			assert.ok(!all.includes("super-secret-value"));
			assert.ok(!all.includes("abcdef123456"));
			assert.match(all, /DATABASE_URL\s+src\/auth\.ts:2/);
			assert.match(all, /JWT_SECRET\s+src\/auth\.ts:3/);
			assert.match(all, /1 env loaders/);
			assert.match(all, /Environment loaders/);
			assert.match(all, /\.env files/);
		},
	);
});

test("existing process.env detection still works alongside loaders", () => {
	withProject(
		{
			"src/app.js": [
				'import "dotenv/config";',
				"const port = process.env.PORT;",
				'process.loadEnvFile(".env");',
			].join("\n"),
		},
		(root) => {
			const result = scanProject(root);
			assert.deepEqual(
				result.variables.map((v) => v.name),
				["PORT"],
			);
			assert.equal(result.loaders.length, 2);
		},
	);
});

test("no loaders or env files keeps the classic output format", () => {
	withProject(
		{ "src/app.ts": ["process.env.PORT", "process.env.LOG_LEVEL"].join("\n") },
		(root) => {
			const outcome = runScan([], root);
			assert.equal(outcome.exitCode, 0);
			const output = outcome.stdout.join("\n");
			assert.equal(output, [
				"2 usages · 2 variables",
				"",
				"LOG_LEVEL  src/app.ts:2",
				"PORT       src/app.ts:1",
			].join("\n"));
		},
	);
});

test("large-directory protection still works after refactor", () => {
	withProject(
		{ "src/app.js": "process.env.PORT;\n" },
		(root) => {
			const refused = runScan([], root, { directoryEntryLimit: 0 });
			assert.equal(refused.exitCode, 1);
			assert.match(refused.stderr.join("\n"), /too large to scan/);

			const forced = runScan(["--force"], root, {
				directoryEntryLimit: 0,
				notify() {},
			});
			assert.equal(forced.exitCode, 0);
		},
	);
});
