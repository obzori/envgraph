import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzeProject, createContext, runEnvGraph } from "../src/index.ts";
import { DEFAULT_CONFIG } from "../src/config/index.ts";

function makeProject(files: Record<string, string> = {}): string {
	const dir = mkdtempSync(path.join(tmpdir(), "envgraph-api-"));
	for (const [name, content] of Object.entries(files)) {
		const full = path.join(dir, name);
		mkdirSync(path.dirname(full), { recursive: true });
		writeFileSync(full, content, "utf8");
	}
	return dir;
}

test("analyzeProject reports usages, variables and scannedFiles", async () => {
	const root = makeProject({
		"src/a.ts": "process.env.PORT;\nprocess.env.HOST;\n",
	});
	try {
		const result = await analyzeProject(root);
				assert.deepEqual([...result.variables].sort(), ["HOST", "PORT"]);
		assert.equal(result.scannedFiles, 1);
		assert.equal(result.usages.length, 2);
		for (const usage of result.usages) {
			assert.equal(usage.column, 1);
			assert.equal(typeof usage.line, "number");
			assert.equal(usage.file, "src/a.ts");
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("analyzeProject include filters the scanned files", async () => {
	const root = makeProject({
		"src/app.ts": "process.env.INCLUDED;\n",
		"other/tool.ts": "process.env.EXCLUDED;\n",
	});
	try {
		const result = await analyzeProject(root, { include: ["src/**"] });
		assert.deepEqual(result.variables, ["INCLUDED"]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("runEnvGraph honors include/exclude from the config via context", async () => {
	const root = makeProject({
		"src/app.ts": "process.env.KEEP;\n",
		"generated/api.ts": "process.env.THROWAWAY;\n",
	});
	try {
		const context = createContext(root, {
			...DEFAULT_CONFIG,
			include: ["src/**"],
			exclude: ["**/generated/**"],
		});
		const result = await runEnvGraph(context);
		assert.deepEqual(result.variables, ["KEEP"]);
		assert.equal(result.scannedFiles, 1);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("runEnvGraph returns sorted, de-duplicated variables with columns", async () => {
	const root = makeProject({
		"index.ts": "process.env.PORT;\nconst { PORT } = process.env;\n",
	});
	try {
		const result = await runEnvGraph(createContext(root, DEFAULT_CONFIG));
		assert.deepEqual(result.variables, ["PORT"]);
		const usages = result.usages
			.filter((u) => u.variable === "PORT")
			.sort((a, b) => a.line - b.line);
		assert.equal(usages.length, 2);
		assert.equal(usages[0]?.line, 1);
		assert.equal(usages[0]?.column, 1);
		// destructured binding element starts later on line 2
		assert.equal(usages[1]?.line, 2);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("analyzeProject returns an empty result with no env usage", async () => {
	const root = makeProject({ "src/app.ts": "const x = 1;\n" });
	try {
		const result = await analyzeProject(root);
		assert.deepEqual(result.variables, []);
		assert.equal(result.scannedFiles, 1);
		assert.equal(result.usages.length, 0);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
