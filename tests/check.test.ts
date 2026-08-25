import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runCheck } from "../src/cli/commands/check.ts";

function makeProject(files: Record<string, string> = {}): string {
	const dir = mkdtempSync(path.join(tmpdir(), "envgraph-check-"));
	for (const [name, content] of Object.entries(files)) {
		const target = path.join(dir, name);
		mkdirSync(path.dirname(target), { recursive: true });
		writeFileSync(target, content, "utf8");
	}
	return dir;
}

function withProject(
	files: Record<string, string>,
	fn: (cwd: string) => void,
): void {
	const cwd = makeProject(files);
	try {
		fn(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

test("everything used and defined -> ok, exit 0", () => {
	withProject(
		{
			".env": "PORT=3000\nDEBUG=true\n",
			"index.js": 'const p = process.env.PORT;\nconst d = process.env["DEBUG"];\n',
		},
		(cwd) => {
			const result = runCheck([], cwd);
			assert.equal(result.exitCode, 0);
			assert.deepEqual(result.issues, []);
			assert.match(result.stdout.join("\n"), /Everything checks out/);
		},
	);
});

test("missing variable -> exit 1 with locations", () => {
	withProject(
		{
			".env": "PORT=3000\n",
			"index.js": "const t = process.env.API_TOKEN;\n",
		},
		(cwd) => {
			const result = runCheck([], cwd);
			assert.equal(result.exitCode, 1);
			const missing = result.issues?.filter((i) => i.kind === "missing") ?? [];
			assert.equal(missing.length, 1);
			assert.equal(missing[0]?.name, "API_TOKEN");
			assert.match(result.stdout.join("\n"), /MISSING/);
			assert.match(result.stdout.join("\n"), /index\.js:1/);
		},
	);
});

test("unused declaration is reported but does not fail", () => {
	withProject(
		{
			".env": "PORT=3000\nOLD_FLAG=yes\n",
			"index.js": "const p = process.env.PORT;\n",
		},
		(cwd) => {
			const result = runCheck([], cwd);
			assert.equal(result.exitCode, 0);
			const unused = result.issues?.filter((i) => i.kind === "unused") ?? [];
			assert.equal(unused.length, 1);
			assert.equal(unused[0]?.name, "OLD_FLAG");
			assert.equal(unused[0]?.locations[0], ".env:2");
			assert.match(result.stdout.join("\n"), /UNUSED/);
		},
	);
});

test("duplicate declarations across env files are detected", () => {
	withProject(
		{
			".env": "PORT=3000\n",
			".env.local": "PORT=4000\n",
			"index.js": "const p = process.env.PORT;\n",
		},
		(cwd) => {
			const result = runCheck([], cwd);
			assert.equal(result.exitCode, 0);
			const dupes = result.issues?.filter((i) => i.kind === "duplicate") ?? [];
			assert.equal(dupes.length, 1);
			assert.equal(dupes[0]?.locations.length, 2);
			assert.match(result.stdout.join("\n"), /DUPLICATE/);
		},
	);
});

test("duplicates within the same file get distinct line numbers", () => {
	withProject(
		{
			".env": "A=1\nB=2\nA=3\n",
			"index.js": "const a = process.env.A;\nconst b = process.env.B;\n",
		},
		(cwd) => {
			const result = runCheck([], cwd);
			const dupes = result.issues?.filter((i) => i.kind === "duplicate") ?? [];
			assert.equal(dupes.length, 1);
			assert.deepEqual(dupes[0]?.locations, [".env:1", ".env:3"]);
		},
	);
});

test("no .env files at all -> everything in use counts as missing", () => {
	withProject({ "index.js": "const p = process.env.PORT;\n" }, (cwd) => {
		const result = runCheck([], cwd);
		assert.equal(result.exitCode, 1);
		assert.match(result.stdout.join("\n"), /No \.env files found/);
	});
});

test(".env.example is ignored (it is a template, not an environment)", () => {
	withProject(
		{
			".env": "PORT=3000\n",
			".env.example": "EXTRA_ONLY_IN_TEMPLATE=1\n",
			"index.js": "const p = process.env.PORT;\n",
		},
		(cwd) => {
			const result = runCheck([], cwd);
			assert.equal(result.exitCode, 0);
			const names = (result.issues ?? []).map((i) => i.name);
			assert.ok(!names.includes("EXTRA_ONLY_IN_TEMPLATE"));
			const json = runCheck(["--format", "json"], cwd);
			const parsed = JSON.parse(json.stdout.join("")) as {
				envFiles: string[];
			};
			assert.deepEqual(parsed.envFiles, [".env"]);
		},
	);
});

test("--format json prints machine-readable issues", () => {
	withProject(
		{
			".env": "OLD=yes\n",
			"index.js": "const p = process.env.PORT;\n",
		},
		(cwd) => {
			const result = runCheck(["--format", "json"], cwd);
			assert.equal(result.raw, true);
			const parsed = JSON.parse(result.stdout.join("")) as {
				ok: boolean;
				issues: Array<{ kind: string; name: string }>;
			};
			assert.equal(parsed.ok, false);
			const kinds = new Set(parsed.issues.map((i) => i.kind));
			assert.ok(kinds.has("missing"));
			assert.ok(kinds.has("unused"));
		},
	);
});