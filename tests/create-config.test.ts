import { test } from "node:test";
import assert from "node:assert/strict";
import {
	existsSync,
	mkdirSync,
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
import { buildExampleContent } from "../src/core/env/generator.ts";
import {
	findConfigPath,
	findProjectRoot,
	getConfig,
	getConfigPath,
	isProjectRoot,
	loadConfig,
} from "../src/config/index.ts";

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
		const target = path.join(dir, name);
		mkdirSync(path.dirname(target), { recursive: true });
		writeFileSync(target, content, "utf8");
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

const ENV_WITH_COMMENTS =
	"# app settings\nPORT=3000\n\n# debug flag\nDEBUG=true\n";

test("buildExampleContent keeps comments by default", () => {
	assert.equal(
		buildExampleContent(ENV_WITH_COMMENTS),
		"# app settings\nPORT=3000\n\n# debug flag\nDEBUG=true\n",
	);
});

test("buildExampleContent drops comments when keepComments is false", () => {
	assert.equal(
		buildExampleContent(ENV_WITH_COMMENTS, { keepComments: false }),
		"PORT=3000\n\nDEBUG=true\n",
	);
});

test("keepComments: false from config file reaches create example", async () => {
	const cwd = makeProject({
		"envgraph.config.js":
			"export default { example: { keepComments: false } };\n",
	});
	try {
		const config = await loadConfig(cwd);
		const content = buildExampleContent(ENV_WITH_COMMENTS, {
			keepComments: config.example.keepComments,
		});
		assert.equal(content, "PORT=3000\n\nDEBUG=true\n");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

// --- upward config search ---

function makeNestedProject(files: Record<string, string>): string {
	const root = makeProject({ ".git": "" });
	for (const [name, content] of Object.entries(files)) {
		const target = path.join(root, name);
		mkdirSync(path.dirname(target), { recursive: true });
		writeFileSync(target, content, "utf8");
	}
	return root;
}

test("findConfigPath searches upward and stops at the project root", () => {
	const root = makeNestedProject({
		"envgraph.config.json": "{}",
		"packages/app/src/index.ts": "",
	});
	try {
		const deep = path.join(root, "packages", "app", "src");
		assert.equal(findConfigPath(deep), path.join(root, "envgraph.config.json"));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("nearest config wins over an ancestor one", () => {
	const root = makeNestedProject({
		"envgraph.config.js": "export default {};",
		"packages/app/envgraph.config.js": "export default {};",
		"packages/app/src/index.ts": "",
	});
	try {
		const deep = path.join(root, "packages", "app", "src");
		assert.equal(
			findConfigPath(deep),
			path.join(root, "packages", "app", "envgraph.config.js"),
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("no config is picked up from outside the project root", () => {
	const outer = makeProject({
		"envgraph.config.js": "export default {};",
		"inner/.git": "",
	});
	try {
		const inner = path.join(outer, "inner");
		assert.equal(findConfigPath(inner), undefined);
	} finally {
		rmSync(outer, { recursive: true, force: true });
	}
});

test("loadConfig resolves a config above cwd", async () => {
	const root = makeNestedProject({
		"envgraph.config.js": "export default { example: { keepComments: false } };",
		"work/index.ts": "",
	});
	try {
		const work = path.join(root, "work");
		const config = await loadConfig(work);
		assert.equal(config.example.keepComments, false);
		assert.equal(getConfigPath(), path.join(root, "envgraph.config.js"));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("isProjectRoot and findProjectRoot detect the root via markers", () => {
	const root = makeProject({
		".git": "",
		"packages/app/index.ts": "",
	});
	try {
		assert.equal(isProjectRoot(root), true);
		const deep = path.join(root, "packages", "app");
		assert.equal(isProjectRoot(deep), false);
		assert.equal(findProjectRoot(deep), path.resolve(root));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("findProjectRoot returns undefined without markers", () => {
	const dir = makeProject({});
	try {
		assert.equal(findProjectRoot(dir), undefined);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});