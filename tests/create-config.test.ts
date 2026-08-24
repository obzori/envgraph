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
import {
	createConfig,
	detectProjectLanguage,
	buildConfigTemplate,
} from "../src/cli/commands/create.ts";
import { findConfigPath, loadConfig, getConfig } from "../src/config/index.ts";

type CreateOpts = {
	cwd: string;
	force: boolean;
	interactive: boolean;
	dryRun: boolean;
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
			dryRun: false,
			prompt: (_q: string) => false,
		});
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

test("create config writes envgraph.config.js in a JS project", () => {
	withProject({}, (cwd, opts) => {
		const result = createConfig(["config"], opts);
		assert.equal(result.exitCode, 0);
		assert.equal(result.wrote, true);
		assert.equal(result.fileName, "envgraph.config.js");
		const file = path.join(cwd, "envgraph.config.js");
		assert.ok(existsSync(file));
		const content = readFileSync(file, "utf8");
		assert.match(content, /keepComments:\s*true/);
		assert.match(content, /defaults:/);
	});
});

test("create config writes envgraph.config.ts when tsconfig.json exists", () => {
	withProject({ "tsconfig.json": "{}" }, (cwd, opts) => {
		const result = createConfig(["config"], opts);
		assert.equal(result.wrote, true);
		assert.equal(result.fileName, "envgraph.config.ts");
		assert.ok(existsSync(path.join(cwd, "envgraph.config.ts")));
		assert.match(readFileSync(path.join(cwd, "envgraph.config.ts"), "utf8"), /export default/);
	});
});

test("--ts and --js flags override detection", () => {
	withProject({ "tsconfig.json": "{}" }, (cwd) => {
		const opts = { cwd, force: false, interactive: false, dryRun: false, prompt: (_q: string) => false };
		assert.equal(detectProjectLanguage(cwd, new Set(["--js"])), "js");
		assert.equal(detectProjectLanguage(cwd, new Set(["--ts"])), "ts");
		const result = createConfig(["config"], opts);
		assert.equal(result.fileName, "envgraph.config.ts");
	});
});

test("create config refuses to overwrite without --force (non-interactive)", () => {
	withProject({}, (_cwd, opts) => {
		createConfig(["config"], opts);
		const result = createConfig(["config"], opts);
		assert.equal(result.exitCode, 1);
		assert.equal(result.wrote, false);
		assert.match(result.stderr[0] ?? "", /--force/);
		const forced = createConfig(["config"], { ...opts, force: true });
		assert.equal(forced.exitCode, 0);
		assert.equal(forced.wrote, true);
		assert.match(forced.stdout[0] ?? "", /Overwrote/);
	});
});

test("create config --dry-run does not write anything", () => {
	withProject({}, (cwd, opts) => {
		const result = createConfig(["config"], { ...opts, dryRun: true });
		assert.equal(result.exitCode, 0);
		assert.equal(result.wrote, false);
		assert.equal(existsSync(path.join(cwd, "envgraph.config.js")), false);
	});
});

test("template is valid default export for both languages", () => {
	assert.match(buildConfigTemplate(true), /export default \{/);
	assert.match(buildConfigTemplate(false), /@type \{import\('envgraph'\)/);
});

test("loadConfig reads envgraph.config.js and merges over defaults", async () => {
	const cwd = makeProject({
		"envgraph.config.js":
			'export default { example: { keepComments: false, defaults: { NODE_ENV: "development" } } };\n',
	});
	try {
		const config = await loadConfig(cwd);
		assert.equal(config.example.keepComments, false);
		assert.deepEqual(config.example.defaults, { NODE_ENV: "development" });
		// untouched keys keep defaults
		assert.deepEqual(config.include, getConfig().include);
		assert.equal(findConfigPath(cwd), path.join(cwd, "envgraph.config.js"));
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("loadConfig falls back to defaults without a config file", async () => {
	const cwd = makeProject();
	try {
		const config = await loadConfig(cwd);
		assert.equal(config.example.keepComments, true);
		assert.deepEqual(config.example.defaults, {});
		assert.equal(findConfigPath(cwd), undefined);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("loadConfig supports JSON config files", async () => {
	const cwd = makeProject({
		"envgraph.config.json": '{ "example": { "keepComments": false } }',
	});
	try {
		const config = await loadConfig(cwd);
		assert.equal(config.example.keepComments, false);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("loadConfig warns on broken config but continues with defaults", async () => {
	const cwd = makeProject({
		"envgraph.config.js": "throw new Error('boom');",
	});
	try {
		const warnings: string[] = [];
		const config = await loadConfig(cwd, (m) => warnings.push(m));
		assert.equal(warnings.length, 1);
		assert.match(warnings[0] ?? "", /failed to load/);
		assert.equal(config.example.keepComments, true);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});