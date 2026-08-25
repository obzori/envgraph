import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatOutput } from "../src/output/index.ts";
import type { ScanResult } from "../src/core/scanner/scanner.ts";
import { parseScanFlags, runScan } from "../src/cli/commands/scan.ts";

function makeResult(): ScanResult {
	return {
		variables: [
			{
				name: "PORT",
				locations: [
					{ file: "src/index.ts", line: 3 },
					{ file: "src/server.ts", line: 7 },
				],
			},
			{
				name: "DATABASE_URL",
				locations: [{ file: "src/db.ts", line: 1 }],
			},
		],
		loaders: [{ kind: "dotenv", line: 1, envFile: ".env", file: "src/index.ts" }],
		envFiles: [".env", ".env.local"],
		errors: [],
	};
}

test("json output serializes variables, loaders and env files", () => {
	const text = formatOutput(makeResult(), { format: "json" });
	const parsed = JSON.parse(text) as ScanResult;
	assert.equal(parsed.variables.length, 2);
	assert.equal(parsed.variables[0]?.name, "PORT");
	assert.equal(parsed.loaders[0]?.kind, "dotenv");
	assert.deepEqual(parsed.envFiles, [".env", ".env.local"]);
});

test("table output renders aligned rows", () => {
	const lines = formatOutput(makeResult(), { format: "table" }).split("\n");
	assert.match(lines[0] ?? "", /3 usages · 2 variables/);
	assert.ok(lines.some((line) => /^DATABASE_URL\s+src\/db\.ts:1$/.test(line)));
	assert.ok(lines.some((line) => /dotenv\s+src\/index\.ts:1 -> \.env/.test(line)));
});

test("mermaid output is a flowchart with nodes and edges", () => {
	const text = formatOutput(makeResult(), { format: "mermaid" });
	assert.match(text, /^flowchart LR/);
	assert.match(text, /\["PORT"\]/);
	assert.match(text, /n\d+ --> n\d+/);
	assert.match(text, /n\d+ --- n\d+/);
});

test("empty result still produces valid output in every format", () => {
	const empty: ScanResult = { variables: [], loaders: [], envFiles: [], errors: [] };
	for (const format of ["json", "table", "mermaid"] as const) {
		const text = formatOutput(empty, { format });
		if (format === "json") {
			assert.doesNotThrow(() => JSON.parse(text));
		} else if (format === "table") {
			assert.match(text, /No environment variables found/);
		} else {
			assert.match(text, /No environment variables found/);
		}
	}
});

test("parseScanFlags accepts --format=value and --output value", () => {
	assert.equal(parseScanFlags(["--format=table"]).flags.format, "table");
	assert.equal(parseScanFlags(["-F", "json"]).flags.format, "json");
	assert.equal(parseScanFlags(["--output", "out.json"]).flags.output, "out.json");
	assert.equal(
		parseScanFlags(["--format=yaml"]).error,
		'unknown format "yaml". Supported formats: classic, json, table, mermaid.',
	);
	assert.match(parseScanFlags(["--format"]).error ?? "", /requires a value/);
});

test("parseScanFlags accepts the classic format", () => {
	assert.equal(parseScanFlags(["--format=classic"]).flags.format, "classic");
	assert.equal(parseScanFlags(["-F", "classic"]).flags.format, "classic");
});

function withFixture(fn: (root: string) => void): void {
	const root = mkdtempSync(join(tmpdir(), "envgraph-scan-"));
	try {
		writeFileSync(join(root, ".env"), "PORT=3000\n");
		mkdirSync(join(root, "src"), { recursive: true });
		writeFileSync(
			join(root, "src", "index.ts"),
			'import "dotenv/config";\nconst port = process.env.PORT;\n',
			"utf8",
		);
		fn(root);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

test("runScan --format json prints raw JSON to stdout", () => {
	withFixture((root) => {
		const outcome = runScan(["--format=json"], root);
		assert.equal(outcome.exitCode, 0);
		assert.equal(outcome.raw, true);
		const parsed = JSON.parse(outcome.stdout.join("\n")) as ScanResult;
		assert.equal(parsed.variables[0]?.name, "PORT");
		assert.equal(parsed.envFiles.length, 1);
	});
});

test("runScan -o writes formatted output to a file", () => {
	withFixture((root) => {
		const target = join(root, "build", "report.md");
		const outcome = runScan(["--format", "mermaid", "-o", target], root);
		assert.equal(outcome.exitCode, 0);
		const written = readFileSync(target, "utf8");
		assert.match(written, /^flowchart LR/);
		assert.match(written, /\["PORT"\]/);
		assert.match(outcome.stdout.join("\n"), /Written to/);
	});
});

test("runScan --format classic prints the human-readable report", () => {
	withFixture((root) => {
		const outcome = runScan(["--format=classic"], root);
		assert.equal(outcome.exitCode, 0);
		assert.match(outcome.stdout.join("\n"), /PORT\s+src\/index\.ts:2/);
	});
});

test("default outputFormat is classic (the built-in default report)", async () => {
	const { DEFAULT_CONFIG } = await import("../src/config/index.ts");
	assert.equal(DEFAULT_CONFIG.outputFormat, "classic");
});