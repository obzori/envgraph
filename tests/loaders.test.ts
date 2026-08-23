import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { findEnvAccesses, findEnvLoaders } from "../src/core/scanner/ast.ts";
import { scanProject } from "../src/core/scanner/scanner.ts";

/** Create a throwaway project directory pre-populated with the given files. */
function makeProject(files: Record<string, string> = {}): string {
	const dir = mkdtempSync(path.join(tmpdir(), "envgraph-loaders-test-"));
	for (const [name, content] of Object.entries(files)) {
		const full = path.join(dir, name);
		mkdirSync(path.dirname(full), { recursive: true });
		writeFileSync(full, content, "utf8");
	}
	return dir;
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

test('import "dotenv/config" is detected as a dotenv loader', () => {
	withProject(
		{ "src/index.js": 'import "dotenv/config";\n' },
		(root) => {
			const result = scanProject(root);
			assert.equal(result.loaders.length, 1);
			assert.equal(result.loaders[0]?.kind, "dotenv");
			assert.equal(result.loaders[0]?.file, "src/index.js");
			assert.equal(result.loaders[0]?.line, 1);
			assert.equal(result.loaders[0]?.envFile, undefined);
		},
	);
});

test('require("dotenv").config() is detected', () => {
	withProject(
		{ "src/index.js": 'require("dotenv").config();\n' },
		(root) => {
			const result = scanProject(root);
			assert.equal(result.loaders.length, 1);
			assert.equal(result.loaders[0]?.kind, "dotenv");
			assert.equal(result.loaders[0]?.line, 1);
		},
	);
});

test("bare dotenv.config() call is detected", () => {
	withProject(
		{ "src/index.js": "dotenv.config();\n" },
		(root) => {
			const result = scanProject(root);
			assert.equal(result.loaders.length, 1);
			assert.equal(result.loaders[0]?.kind, "dotenv");
		},
	);
});

test("default dotenv import + config() call is detected", () => {
	withProject(
		{
			"src/index.js": [
				'import dotenv from "dotenv";',
				"dotenv.config();",
			].join("\n"),
		},
		(root) => {
			const result = scanProject(root);
			assert.equal(result.loaders.length, 1);
			assert.equal(result.loaders[0]?.kind, "dotenv");
			assert.equal(result.loaders[0]?.line, 2);
		},
	);
});

test("namespace dotenv import + config() call is detected", () => {
	withProject(
		{
			"src/index.ts": [
				'import * as dotenv from "dotenv";',
				"dotenv.config();",
			].join("\n"),
		},
		(root) => {
			const result = scanProject(root);
			assert.equal(result.loaders.length, 1);
			assert.equal(result.loaders[0]?.kind, "dotenv");
		},
	);
});

test('const dotenv = require("dotenv") + config() call is detected', () => {
	withProject(
		{
			"src/index.js": [
				'const dotenv = require("dotenv");',
				"dotenv.config();",
			].join("\n"),
		},
		(root) => {
			const result = scanProject(root);
			assert.equal(result.loaders.length, 1);
			assert.equal(result.loaders[0]?.kind, "dotenv");
			assert.equal(result.loaders[0]?.line, 2);
		},
	);
});

test("dotenv.config({ path }) with string literal records the env file", () => {
	withProject(
		{
			"a.js": 'dotenv.config({ path: ".env.local" });',
			"b.js": 'dotenv.config({\n\tpath: ".env.production",\n});',
			"c.js": 'dotenv.config({ path: "./config/.env" });',
		},
		(root) => {
			const result = scanProject(root);
			assert.deepEqual(
				result.loaders.map((l) => l.envFile),
				[".env.local", ".env.production", "./config/.env"],
			);
		},
	);
});

test("dynamic dotenv path records the loader without an env file", () => {
	withProject(
		{
			"src/index.js": [
				'import dotenv from "dotenv";',
				"dotenv.config({ path: process.env.ENV_FILE });",
			].join("\n"),
		},
		(root) => {
			const result = scanProject(root);
			assert.equal(result.loaders.length, 1);
			assert.equal(result.loaders[0]?.kind, "dotenv");
			assert.equal(result.loaders[0]?.envFile, undefined);
		},
	);
});

test("process.loadEnvFile() without arguments is detected", () => {
withProject(
{ "src/index.js": "process.loadEnvFile();\n" },
(root) => {
const result = scanProject(root);
assert.equal(result.loaders.length, 1);
assert.equal(result.loaders[0]?.kind, "node-load-env-file");
assert.equal(result.loaders[0]?.envFile, undefined);
},
);
});

test('process.loadEnvFile(".env.local") records the static path', () => {
withProject(
{ "src/index.js": 'process.loadEnvFile(".env.local");\n' },
(root) => {
const result = scanProject(root);
assert.equal(result.loaders.length, 1);
assert.equal(result.loaders[0]?.kind, "node-load-env-file");
assert.equal(result.loaders[0]?.envFile, ".env.local");
assert.equal(result.loaders[0]?.line, 1);
},
);
});

test("string literals and comments are not loaders (no false positives)", () => {
const source = [
'const text = "dotenv.config();";',
'const t2 = "process.loadEnvFile();";',
"// process.env.PORT",
"// dotenv.config();",
].join("\n");
assert.deepEqual(findEnvLoaders(source), []);
assert.deepEqual(findEnvAccesses(source), []);
});

test("a local object named dotenv is not the npm package", () => {
const source = [
"const dotenv = { config() {} };",
"dotenv.config();",
].join("\n");
assert.deepEqual(findEnvLoaders(source), []);
});

test('local module "./dotenv" is not treated as npm dotenv', () => {
withProject(
{
"src/local.js": [
'import dotenv from "./dotenv";',
"dotenv.config();",
'const d = require("./dotenv");',
"d.config();",
].join("\n"),
},
(root) => {
const result = scanProject(root);
assert.deepEqual(result.loaders, []);
},
);
});
