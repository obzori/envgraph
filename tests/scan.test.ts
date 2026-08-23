import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { findEnvAccesses } from "../src/core/scanner/ast.ts";
import { scanProject } from "../src/core/scanner/scanner.ts";
import { runScan } from "../src/cli/commands/scan.ts";

/** Create a throwaway project directory pre-populated with the given files. */
function makeProject(files: Record<string, string> = {}): string {
	const dir = mkdtempSync(path.join(tmpdir(), "envgraph-scan-test-"));
	writeFiles(dir, files);
	return dir;
}

function writeFiles(dir: string, files: Record<string, string>): void {
	for (const [name, content] of Object.entries(files)) {
		const full = path.join(dir, name);
		mkdirSync(path.dirname(full), { recursive: true });
		writeFileSync(full, content, "utf8");
	}
}

/** Run `fn` against a temp project, cleaning up afterwards. */
function withProject(
	files: Record<string, string>,
	fn: (root: string) => void,
): void {
	const root = makeProject(files);
	try {
		fn(root);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

function names(result: ReturnType<typeof scanProject>): string[] {
	return result.variables.map((v) => v.name);
}

test("detects process.env.PORT (dot notation)", () => {
	const accesses = findEnvAccesses("const port = process.env.PORT;\n");
	assert.equal(accesses.length, 1);
	assert.equal(accesses[0]?.name, "PORT");
	assert.equal(accesses[0]?.line, 1);
});

test('detects process.env["PORT"] (double-quoted bracket notation)', () => {
	const accesses = findEnvAccesses('const port = process.env["PORT"];\n');
	assert.equal(accesses.length, 1);
	assert.equal(accesses[0]?.name, "PORT");
	assert.equal(accesses[0]?.line, 1);
});

test("detects process.env['PORT'] (single-quoted bracket notation)", () => {
	const accesses = findEnvAccesses("const port = process.env['PORT'];\n");
	assert.equal(accesses.length, 1);
	assert.equal(accesses[0]?.name, "PORT");
	assert.equal(accesses[0]?.line, 1);
});

test("detects multiple different variables", () => {
	const accesses = findEnvAccesses(
		[
			"const db = process.env.DATABASE_URL;",
			'const port = process.env["PORT"];',
			"const host = process.env['HOST'];",
		].join("\n"),
	);
	assert.deepEqual(
		accesses.map((a) => a.name).sort(),
		["DATABASE_URL", "HOST", "PORT"],
	);
});

test("duplicate usages are recorded as one variable with all locations", () => {
	withProject(
		{
			"src/server.ts": [
				"process.env.PORT",
				"process.env.PORT",
				'process.env["PORT"]',
			].join("\n"),
			"src/config.ts": "process.env['PORT'];\n",
		},
		(root) => {
			const result = scanProject(root);
			assert.deepEqual(names(result), ["PORT"]);
			assert.deepEqual(
				result.variables[0]?.locations,
				[
					{ file: "src/config.ts", line: 1 },
					{ file: "src/server.ts", line: 1 },
					{ file: "src/server.ts", line: 2 },
					{ file: "src/server.ts", line: 3 },
				],
			);
		},
	);
});

test("reports correct file paths and line numbers across files", () => {
	withProject(
		{
			"src/db.ts": "const a = 1;\nconst db = process.env.DATABASE_URL;\n",
			"index.js": "process.env.HOME;\n",
		},
		(root) => {
			const result = scanProject(root);
			const db = result.variables.find((v) => v.name === "DATABASE_URL");
			assert.deepEqual(db?.locations, [{ file: "src/db.ts", line: 2 }]);
			const home = result.variables.find((v) => v.name === "HOME");
			assert.deepEqual(home?.locations, [{ file: "index.js", line: 1 }]);
		},
	);
});

test("scans both JavaScript and TypeScript files", () => {
	withProject(
		{
			"a.js": "process.env.A;\n",
			"b.jsx": "process.env.B;\n",
			"c.ts": "process.env.C;\n",
			"d.tsx": "process.env.D;\n",
		},
		(root) => {
			const result = scanProject(root);
			assert.deepEqual(names(result).sort(), ["A", "B", "C", "D"]);
		},
	);
});

test("unsupported destructuring is ignored", () => {
	const accesses = findEnvAccesses(
		"const { PORT, API_KEY } = process.env;\n",
	);
	assert.equal(accesses.length, 0);
});

test("dynamic bracket access is ignored (variable and template literal)", () => {
	const accesses = findEnvAccesses(
		[
			"const key = 'PORT';",
			"const a = process.env[key];",
			"const b = process.env[`PORT`];",
		].join("\n"),
	);
	assert.equal(accesses.length, 0);
});


test("no matches produces a successful, empty result", () => {
	withProject({ "src/app.ts": "const x = 1;\n" }, (root) => {
		const result = scanProject(root);
		assert.deepEqual(result.variables, []);
		const outcome = runScan([], root);
		assert.equal(outcome.exitCode, 0);
		assert.match(outcome.stdout.join("\n"), /No environment variables found\./);
	});
});

test("node_modules is not scanned", () => {
	withProject(
		{
			"src/app.ts": "process.env.REAL;\n",
			"node_modules/pkg/index.js": "process.env.FROM_NODE_MODULES;\n",
		},
		(root) => {
			const result = scanProject(root);
			assert.deepEqual(names(result), ["REAL"]);
		},
	);
});

test("dist and build directories are not scanned", () => {
	withProject(
		{
			"src/app.ts": "process.env.REAL;\n",
			"dist/index.js": "process.env.FROM_DIST;\n",
			"build/index.js": "process.env.FROM_BUILD;\n",
		},
		(root) => {
			assert.deepEqual(names(scanProject(root)), ["REAL"]);
		},
	);
});

test(".env is never read, even when it contains env-like assignments", () => {
	withProject(
		{
			".env": "SECRET_TOKEN_FROM_DOTENV=1\n",
			"src/app.ts": "process.env.REAL;\n",
		},
		(root) => {
			const result = scanProject(root);
			assert.deepEqual(names(result), ["REAL"]);
		},
	);
});

test("a file with a syntax error does not crash the scan", () => {
	withProject(
		{
			"src/broken.ts": "const x = = = ;\n",
			"src/ok.ts": "process.env.PORT;\n",
		},
		(root) => {
			const result = scanProject(root);
			// The parser is error-tolerant; either way PORT is found and the
			// scan completes.
			assert.deepEqual(names(result), ["PORT"]);
			assert.ok(Array.isArray(result.errors));
		},
	);
});

test("runScan prints a compact aligned summary with locations", () => {
	withProject(
		{
			"src/server.js": [
				"const db = process.env.DATABASE_URL;",
				'const port = process.env["PORT"];',
				"const host = process.env['HOST'];",
			].join("\n"),
		},
		(root) => {
			const outcome = runScan([], root);
			assert.equal(outcome.exitCode, 0);
			assert.equal(
				outcome.stdout.join("\n"),
				[
					"3 usages · 3 variables",
					"",
					"DATABASE_URL  src/server.js:1",
					"HOST          src/server.js:3",
					"PORT          src/server.js:2",
				].join("\n"),
			);
		},
	);
});

test("runScan warns when scanning a very large directory", () => {
	withProject(
		{ "src/app.ts": "process.env.PORT;\n" },
		(root) => {
			const outcome = runScan([], root, { largeDirectoryThreshold: 0 });
			assert.equal(outcome.exitCode, 0);
			const output = outcome.stdout.join("\n");
			assert.match(output, /⚠ Scanning a large directory: 1 source files/);
			assert.match(output, /This may take a while\.\.\./);
		},
	);
});

test("runScan refuses huge directories without --force", () => {
	withProject(
		{ "src/app.ts": "process.env.PORT;\n" },
		(root) => {
			const outcome = runScan([], root, { directoryEntryLimit: 0 });
			assert.equal(outcome.exitCode, 1);
			const err = outcome.stderr.join("\n");
			assert.match(err, /too large to scan/);
			assert.match(err, /--force/);
			assert.match(outcome.stdout.join("\n") || "", /^$/);
		},
	);
});

test("runScan --force scans a huge directory with a warning", () => {
	withProject(
		{ "src/app.ts": "process.env.PORT;\n" },
		(root) => {
			const notified: string[] = [];
			const outcome = runScan(["--force"], root, {
				directoryEntryLimit: 0,
				notify(line) {
					notified.push(line);
				},
			});
			assert.equal(outcome.exitCode, 0);
			assert.ok(notified.some((line) => line.includes("large directory")));
			assert.match(outcome.stdout.join("\n"), /PORT\s+src\/app\.ts:1/);
		},
	);
});

test("runScan does not warn for normal-sized directories", () => {
	withProject(
		{ "src/app.ts": "process.env.PORT;\n" },
		(root) => {
			const outcome = runScan([], root);
			assert.equal(outcome.exitCode, 0);
			assert.doesNotMatch(
				outcome.stdout.join("\n"),
				/Scanning a large directory/,
			);
		},
	);
});

test("runScan shows a single primary location with ×N for duplicates", () => {
	withProject(
		{
			"src/app.ts": [
				"process.env.PORT",
				"process.env.PORT",
				'process.env["PORT"]',
				"process.env.LOG_LEVEL",
			].join("\n"),
		},
		(root) => {
			const outcome = runScan([], root);
			assert.equal(outcome.exitCode, 0);
			assert.equal(
				outcome.stdout.join("\n"),
				[
					"4 usages · 2 variables",
					"",
					"LOG_LEVEL  src/app.ts:4",
					"PORT       src/app.ts:1 ×3",
				].join("\n"),
			);
		},
	);
});

