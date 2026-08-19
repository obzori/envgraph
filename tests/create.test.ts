import { test } from "node:test";
import assert from "node:assert/strict";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isSensitiveName } from "../src/core/env/sanitizer.ts";
import { parseEnvFile } from "../src/core/env/parser.ts";
import { buildExampleContent } from "../src/core/env/generator.ts";
import { createExample } from "../src/cli/commands/create.ts";

type CreateOpts = {
	cwd: string;
	force: boolean;
	interactive: boolean;
	prompt: (q: string) => boolean;
};

/** Create a throwaway project directory pre-populated with the given files. */
function makeProject(files: Record<string, string> = {}): string {
	const dir = mkdtempSync(path.join(tmpdir(), "envgraph-test-"));
	for (const [name, content] of Object.entries(files)) {
		writeFileSync(path.join(dir, name), content, "utf8");
	}
	return dir;
}

/** Run `fn(cwd, opts)` against a temp project, cleaning up afterwards. */
function withProject(
	files: Record<string, string>,
	fn: (cwd: string, opts: CreateOpts) => void,
): void {
	const cwd = makeProject(files);
	try {
		fn(cwd, {
			cwd,
			force: false,
			interactive: false,
			prompt: (_q: string) => false,
		});
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

const EXAMPLE_INPUT =
	"PORT=3000\n" +
	"LOG=info\n" +
	"NODE_ENV=development\n" +
	"API_KEY=abc123\n" +
	"JWT_SECRET=super-secret-value\n" +
	"PASSWORD=my-password\n" +
	"DEBUG=true\n" +
	"DATABASE_URL=postgres://user:password@localhost/mydb\n";

const EXAMPLE_EXPECTED =
	"PORT=3000\n" +
	"LOG=info\n" +
	"NODE_ENV=development\n" +
	"API_KEY=\n" +
	"JWT_SECRET=\n" +
	"PASSWORD=\n" +
	"DEBUG=true\n" +
	"DATABASE_URL=\n";

test(".env does not exist -> error exit 1 and no example created", () => {
	withProject({}, (cwd, opts) => {
		const result = createExample(["example"], opts);
		assert.equal(result.exitCode, 1);
		assert.equal(result.wrote, false);
		assert.ok(result.stderr.length > 0);
		assert.match(result.stderr[0] ?? "", /not found/i);
		assert.equal(existsSync(path.join(cwd, ".env.example")), false);
	});
});

test("basic .env parsing preserves line kinds and order", () => {
	const lines = parseEnvFile("PORT=3000\n\nLOG=info\n# a comment\nPASSWORD=secret\n");
	assert.equal(lines.length, 5);
	assert.deepEqual(lines[0], { kind: "assignment", name: "PORT", value: "3000" });
	assert.equal(lines[1]?.kind, "blank");
	assert.deepEqual(lines[2], { kind: "assignment", name: "LOG", value: "info" });
	assert.equal(lines[3]?.kind, "comment");
	assert.deepEqual(lines[4], { kind: "assignment", name: "PASSWORD", value: "secret" });
});

test("safe values are preserved verbatim (including API_URL, quotes)", () => {
	const content =
		"PORT=3000\n" +
		"LOG=info\n" +
		"NODE_ENV=development\n" +
		"API_URL=https://example.com\n" +
		'GREETING="hello world"\n';
	const out = buildExampleContent(content);
		assert.equal(out, "PORT=3000\nLOG=info\nNODE_ENV=development\nAPI_URL=https://example.com\nGREETING=\"hello world\"\n");
});

test("PASSWORD is sanitized", () => {
	const out = buildExampleContent("PASSWORD=my-password\n");
	assert.equal(out, "PASSWORD=\n");
	assert.equal(out.includes("my-password"), false);
});

test("TOKEN is sanitized", () => {
	const out = buildExampleContent("AUTH_TOKEN=xyz123\n");
	assert.equal(out, "AUTH_TOKEN=\n");
	assert.equal(out.includes("xyz123"), false);
});

test("SECRET is sanitized", () => {
	const out = buildExampleContent("JWT_SECRET=super-secret-value\n");
	assert.equal(out, "JWT_SECRET=\n");
	assert.equal(out.includes("super-secret-value"), false);
});

test("API_KEY is sanitized", () => {
	const out = buildExampleContent("API_KEY=abc123\n");
	assert.equal(out, "API_KEY=\n");
	assert.equal(out.includes("abc123"), false);
});

test("DATABASE_URL is sanitized", () => {
	const value = "postgres://user:password@localhost/mydb";
	const out = buildExampleContent(`DATABASE_URL=${value}\n`);
	assert.equal(out, "DATABASE_URL=\n");
	assert.equal(out.includes(value), false);
});

test("sensitive name detection is case-insensitive", () => {
	assert.equal(isSensitiveName("password"), true);
	assert.equal(isSensitiveName("API_KEY"), true);
	assert.equal(isSensitiveName("jwt_secret"), true);
	assert.equal(isSensitiveName("database_uri"), true);
	assert.equal(isSensitiveName("Pass"), true);
	// These must NOT be flagged despite containing URL/KEY/ID-like substrings.
	assert.equal(isSensitiveName("API_URL"), false);
	assert.equal(isSensitiveName("PORT"), false);
	assert.equal(isSensitiveName("NODE_ENV"), false);
	assert.equal(isSensitiveName("USER_ID"), false);
	assert.equal(isSensitiveName("MONKEY"), false);
});

test("comments are preserved", () => {
	const out = buildExampleContent("# top comment\nPORT=3000\n\n# trailing comment\n");
	assert.equal(out, "# top comment\nPORT=3000\n\n# trailing comment\n");
});

test("variable ordering is preserved", () => {
	assert.equal(buildExampleContent("Z=1\nA=2\nM=3\n"), "Z=1\nA=2\nM=3\n");
});

test("existing .env.example is not silently overwritten without --force", () => {
	withProject(
		{ ".env": "PORT=3000\n", ".env.example": "EXISTING=1\n" },
		(cwd, opts) => {
			const result = createExample(["example"], opts);
			assert.equal(result.exitCode, 1);
			assert.equal(result.wrote, false);
			assert.equal(
				readFileSync(path.join(cwd, ".env.example"), "utf8"),
				"EXISTING=1\n",
			);
		},
	);
});

test("generated .env.example matches the expected sanitized output", () => {
	const out = buildExampleContent(EXAMPLE_INPUT);
	assert.equal(out, EXAMPLE_EXPECTED);
	assert.equal(out.includes("abc123"), false);
	assert.equal(out.includes("super-secret-value"), false);
	assert.equal(out.includes("my-password"), false);
	assert.equal(out.includes("postgres://user:password"), false);
});

test("create example exits 0 and writes the file", () => {
	withProject({ ".env": "PORT=3000\nAPI_KEY=abc\n" }, (cwd, opts) => {
		const result = createExample(["example"], opts);
		assert.equal(result.exitCode, 0);
		assert.equal(result.wrote, true);
		assert.equal(
			readFileSync(path.join(cwd, ".env.example"), "utf8"),
			"PORT=3000\nAPI_KEY=\n",
		);
		const stdout = result.stdout.join("\n");
		assert.match(stdout, /Created .env\.example/);
		assert.match(stdout, /IMPORTANT: CHECK .env\.example BEFORE COMMITTING/);
	});
});

test("--force overwrites an existing .env.example", () => {
	withProject(
		{ ".env": "PORT=3000\n", ".env.example": "OLD=1\n" },
		(cwd, opts) => {
			const result = createExample(["example", "--force"], { ...opts, force: true });
			assert.equal(result.exitCode, 0);
			assert.equal(result.wrote, true);
			assert.equal(
				readFileSync(path.join(cwd, ".env.example"), "utf8"),
				"PORT=3000\n",
			);
		},
	);
});

test("interactive prompt overwrites only when the user confirms (and declines safely)", () => {
	let called = false;
	withProject(
		{ ".env": "PORT=3000\n", ".env.example": "OLD=1\n" },
		(cwd, opts) => {
			const result = createExample(["example"], {
				...opts,
				interactive: true,
				prompt: (_q: string) => {
					called = true;
					return true;
				},
			});
			assert.equal(called, true);
			assert.equal(result.wrote, true);
			assert.equal(
				readFileSync(path.join(cwd, ".env.example"), "utf8"),
				"PORT=3000\n",
			);
		},
	);

	let calledNo = false;
	withProject(
		{ ".env": "PORT=3000\n", ".env.example": "OLD=1\n" },
		(cwd, opts) => {
			const result = createExample(["example"], {
				...opts,
				interactive: true,
				prompt: (_q: string) => {
					calledNo = true;
					return false;
				},
			});
			assert.equal(calledNo, true);
			assert.equal(result.wrote, false);
			assert.equal(
				readFileSync(path.join(cwd, ".env.example"), "utf8"),
				"OLD=1\n",
			);
		},
	);
});


