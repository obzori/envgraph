import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../src/cli/index.ts";

/**
 * Minimal placeholder test suite. It exercises the CLI dispatcher end-to-end
 * by capturing stdout. Analysis-related tests will be added later.
 */

/** Run a function while capturing anything written to stdout. */
function captureStdout(fn: () => number): { code: number; output: string } {
	const chunks: string[] = [];
	const original = process.stdout.write.bind(process.stdout);

	(process.stdout as unknown as { write: (chunk: unknown) => boolean }).write = (
		chunk: unknown,
	) => {
		chunks.push(String(chunk));
		return true;
	};

	try {
		const code = fn();
		return { code, output: chunks.join("") };
	} finally {
		process.stdout.write = original;
	}
}

test("default command prints the ready message and exits 0", () => {
	const { code, output } = captureStdout(() => run(["node", "envgraph"]));
	assert.equal(code, 0);
	assert.match(output, /envgraph is ready\./);
});

test("--help prints usage and exits 0", () => {
	const { code, output } = captureStdout(() => run(["node", "envgraph", "--help"]));
	assert.equal(code, 0);
	assert.match(output, /Usage:/);
	assert.match(output, /envgraph/);
});

test("--version prints a semantic version and exits 0", () => {
	const { code, output } = captureStdout(() =>
		run(["node", "envgraph", "--version"]),
	);
	assert.equal(code, 0);
	assert.match(output, /^envgraph v\d+\.\d+\.\d+/);
});

test("unknown commands exit 1", () => {
	const { code } = captureStdout(() =>
		run(["node", "envgraph", "does-not-exist"]),
	);
	assert.equal(code, 1);
});
