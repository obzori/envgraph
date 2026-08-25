import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { discoverEnvFiles } from "../../filesystem/index.ts";
import { parseCheckFlags } from "./check-flags.ts";
import { buildIssues } from "./check-issues.ts";
import type { CheckIssue } from "./check-issues.ts";
import { formatCheckReport } from "./check-report.ts";
import { countEntries } from "../../filesystem/index.ts";
import { DIRECTORY_ENTRY_LIMIT } from "./scan.ts";

export interface CheckOutcome {
	readonly exitCode: number;
	readonly stdout: readonly string[];
	readonly stderr: readonly string[];
	readonly raw?: boolean;
	readonly issues?: readonly CheckIssue[];
}

// implements `envgraph check`; pure w.r.t. process state, async-free so it
// can run in a worker thread while the spinner animates
export function runCheck(
	args: readonly string[],
	root: string,
): CheckOutcome {
	const stdout: string[] = [];
	const stderr: string[] = [];

	if (args.includes("--help") || args.includes("-h")) {
		stdout.push("Usage: envgraph check [--format json] [-o <file>] [--force]");
		stdout.push("Compare .env declarations with actual process.env usage.");
		return { exitCode: 0, stdout, stderr };
	}

	const { flags, error } = parseCheckFlags(args);
	if (error !== undefined) {
		stderr.push(`envgraph check: ${error}`);
		return { exitCode: 1, stdout, stderr };
	}

	const force = args.includes("--force") || args.includes("-f");
	const size = countEntries(root, DIRECTORY_ENTRY_LIMIT);
	if (size.exceeded && !force) {
		stderr.push(
			`envgraph check: directory ${root} is too large to check (more than ${DIRECTORY_ENTRY_LIMIT} entries).`,
		);
		stderr.push("Run from a project root instead, or pass --force.");
		return { exitCode: 1, stdout, stderr };
	}

	// .env.example is a template for committing, not an actual environment
	const envFiles = discoverEnvFiles(root).filter((f) => !f.endsWith(".example"));
	const { issues, usedCount } = buildIssues(root, envFiles);
	const missingCount = issues.filter((i) => i.kind === "missing").length;
	const exitCode = missingCount > 0 ? 1 : 0;

	if (flags.format === "json") {
		const text = JSON.stringify({ ok: exitCode === 0, envFiles, issues }, null, 2);
		if (flags.output !== undefined) {
			try {
				mkdirSync(dirname(flags.output), { recursive: true });
				writeFileSync(flags.output, `${text}\n`, "utf8");
			} catch (writeError) {
				stderr.push(
					`envgraph check: could not write ${flags.output}: ${writeError instanceof Error ? writeError.message : String(writeError)}`,
				);
				return { exitCode: 1, stdout, stderr };
			}
			stdout.push(`✓ Written to ${flags.output}`);
			return { exitCode, stdout, stderr, issues };
		}
		return { exitCode, stdout: [text], stderr, raw: true, issues };
	}

	stdout.push(...formatCheckReport(issues, envFiles.length, usedCount, missingCount, root));
	return { exitCode, stdout, stderr, issues };
}