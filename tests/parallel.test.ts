import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { scanProject } from "../src/core/scanner/scanner.ts";
import { scanProjectParallel } from "../src/core/scanner/parallel.ts";

function makeProject(files: Record<string, string>): string {
	const dir = mkdtempSync(path.join(tmpdir(), "envgraph-par-"));
	for (const [name, content] of Object.entries(files)) {
		const full = path.join(dir, name);
		mkdirSync(path.dirname(full), { recursive: true });
		writeFileSync(full, content, "utf8");
	}
	return dir;
}

// The pool splits files across threads, so the merged result must be
// byte-for-byte identical to the synchronous scan — same variables, same
// location order, same loaders, same envFiles, same scannedFiles.
test("parallel scan matches the synchronous scan bit-for-bit", async () => {
	const root = makeProject({
		"src/a.ts": "process.env.PORT;\nconst { HOST } = process.env;\n",
		"src/b.ts": 'import "dotenv/config";\nBun.env.NODE_ENV;\n',
		"src/c.ts": "Deno.env.get('API_KEY');\n",
		"src/d.ts": "const x = 1;\n",
		"src/e.ts": "process . env . TOKEN;\n",
		"sub/env.ts": "import.meta.env.MODE;\n",
		".env": "PORT=1\n",
		".env.local": "X=1\n",
	});
	try {
		const sync = scanProject(root);
		const parallel = await scanProjectParallel(root);
		assert.deepEqual(parallel, sync);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// enough files to cross multiple worker batches (CHUNK_FILES = 64): exercises
// the round-robin distribution, the per-chunk merge and the final sorting
test("parallel scan handles a multi-worker tree identically", async () => {
	const files: Record<string, string> = {};
	for (let i = 0; i < 300; i++) {
		const kind = i % 5;
		const content =
			kind === 0
				? `process.env.VAR_${i};\n`
				: kind === 1
					? `const { A${i} } = process.env;\n`
					: kind === 2
						? 'import "dotenv/config";\n'
						: kind === 3
							? `Bun.env.B${i};\n`
							: `const x = ${i};\n`;
		files[`src/f${String(i).padStart(4, "0")}.ts`] = content;
	}
	const root = makeProject(files);
	try {
		const sync = scanProject(root);
		const parallel = await scanProjectParallel(root);
		assert.deepEqual(parallel, sync);
		assert.equal(parallel.scannedFiles, 300);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("parallel scan honors include/exclude and reports envFiles", async () => {
	const root = makeProject({
		"src/app.ts": "process.env.INCLUDED;\n",
		"generated/api.ts": "process.env.THROWAWAY;\n",
		".env.example": "INCLUDED=1\n",
	});
	try {
		const sync = scanProject(root, {
			include: ["src/**"],
			exclude: ["**/generated/**"],
		});
		const parallel = await scanProjectParallel(root, {
			include: ["src/**"],
			exclude: ["**/generated/**"],
		});
		assert.deepEqual(parallel, sync);
		assert.deepEqual(parallel.envFiles, [".env.example"]);
		assert.deepEqual(
			parallel.variables.map((v) => v.name),
			["INCLUDED"],
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("parallel scan of an empty project matches the sync result", async () => {
	const root = makeProject({});
	try {
		const sync = scanProject(root);
		const parallel = await scanProjectParallel(root);
		assert.deepEqual(parallel, sync);
		assert.equal(parallel.scannedFiles, 0);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// the CLI pool path routes small trees to the sync scan (no worker boot), so
// its result must be byte-identical to runScan — while still async for the
// spinner. Regression guard for the PARALLEL_MIN_FILES routing.
import { runScan, runScanParallel } from "../src/cli/commands/scan-run.ts";

test("runScanParallel routes small trees to sync and stays identical", async () => {
	const root = makeProject({
		"src/a.ts": "process.env.KEY;\n",
		"src/b.ts": 'import "dotenv/config";\nconst { OTHER } = process.env;\n',
		".env": "KEY=1\n",
	});
	try {
		const sync = runScan(["--format", "json"], root);
		const parallel = await runScanParallel(["--format", "json"], root);
		assert.equal(parallel.exitCode, sync.exitCode);
		assert.deepEqual(parallel.stdout, sync.stdout);
		assert.deepEqual(parallel.stderr, sync.stderr);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// live progress: the onFileDiscovered callback fires during the walk with a
// monotonically increasing count ending at the number of scanned files
test("runScanParallel reports live file discovery progress", async () => {
	const root = makeProject({
		"src/a.ts": "process.env.KEY;\n",
		"src/b.ts": "process.env.OTHER;\n",
		"src/c.ts": "process.env.THIRD;\n",
		".env": "KEY=1\n",
	});
	try {
		const seen: number[] = [];
		const outcome = await runScanParallel(["--format", "json"], root, {
			onFileDiscovered: (count) => seen.push(count),
		});
		assert.equal(outcome.exitCode, 0);
		assert.ok(seen.length >= 3, "callback should fire at least once per file");
		assert.equal(seen[0], 1);
		assert.equal(seen[seen.length - 1], 3);
		for (let i = 1; i < seen.length; i++) {
			assert.ok(seen[i]! > seen[i - 1]!, "count must increase");
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});