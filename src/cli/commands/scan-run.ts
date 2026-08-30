import { scanProject } from "../../core/scanner/scanner.ts";
import { scanProjectParallel } from "../../core/scanner/parallel.ts";
import type { ScanResult } from "../../core/scanner/scanner.ts";
import { formatOutput } from "../../output/index.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseScanFlags } from "./scan-flags.ts";
import type { ScanFlags } from "./scan-flags.ts";
import { checkLargeDirectory } from "./scan-guard.ts";
import { formatClassicReport, stripNotice } from "./scan-report.ts";

export interface ScanOutcome {
	readonly exitCode: number;
	readonly stdout: readonly string[];
	readonly stderr: readonly string[];
	// true when stdout carries formatted content (--format given) that must
	// be printed verbatim, without CLI styling
	readonly raw?: boolean;
}

export interface ScanRunOptions {
	notify?: (line: string) => void;
	directoryEntryLimit?: number;
	largeDirectoryThreshold?: number;
	// include/exclude globs from envgraph.config (see ScanOptions)
	include?: readonly string[];
	exclude?: readonly string[];
}

// implements `envgraph scan`; pure w.r.t. process state — returns an outcome,
// printing is done by the command wrapper. Async-free so it can run inline
// (tests, fallback); the CLI prefers the runScanParallel pool below.
export function runScan(
	args: readonly string[],
	root: string,
	options?: ScanRunOptions,
): ScanOutcome {
	const stdout: string[] = [];
	const stderr: string[] = [];

	const head = scanHead(args, stdout, stderr);
	if (!("flags" in head)) {
		return head;
	}
	const notify = options?.notify;

	if (checkLargeDirectory(root, args, stderr, notify, options?.directoryEntryLimit)) {
		return { exitCode: 1, stdout, stderr };
	}

	const scan = scanProject(root, {
		largeDirectoryThreshold: options?.largeDirectoryThreshold,
		include: options?.include,
		exclude: options?.exclude,
	});

	return finishScan(scan, head.flags, notify, stdout, stderr);
}

// parallel variant used by the CLI: flags/guard/walk/merge stay on the caller's
// thread, the per-file parse runs in a worker pool while the spinner animates
export async function runScanParallel(
	args: readonly string[],
	root: string,
	options?: ScanRunOptions,
): Promise<ScanOutcome> {
	const stdout: string[] = [];
	const stderr: string[] = [];

	const head = scanHead(args, stdout, stderr);
	if (!("flags" in head)) {
		return head;
	}
	const notify = options?.notify;

	if (checkLargeDirectory(root, args, stderr, notify, options?.directoryEntryLimit)) {
		return { exitCode: 1, stdout, stderr };
	}

	let scan: ScanResult;
	try {
		scan = await scanProjectParallel(root, {
			largeDirectoryThreshold: options?.largeDirectoryThreshold,
			include: options?.include,
			exclude: options?.exclude,
		});
	} catch {
		// the pool is unavailable or failed — fall back to the proven sync path
		scan = scanProject(root, {
			largeDirectoryThreshold: options?.largeDirectoryThreshold,
			include: options?.include,
			exclude: options?.exclude,
		});
	}

	return finishScan(scan, head.flags, notify, stdout, stderr);
}

// shared head of runScan/runScanParallel: --help and flag errors short-circuit
// with an outcome; otherwise returns the parsed flags
function scanHead(
	args: readonly string[],
	stdout: string[],
	stderr: string[],
): { flags: ScanFlags } | ScanOutcome {
	if (args.includes("--help") || args.includes("-h")) {
		stdout.push(
			"Usage: envgraph scan [--force] [--format classic|json|table|mermaid] [-o <file>]",
		);
		stdout.push("Scan the project for environment variables used via process.env.");
		return { exitCode: 0, stdout, stderr };
	}

	const { flags, error } = parseScanFlags(args);
	if (error !== undefined) {
		stderr.push(`envgraph scan: ${error}`);
		return { exitCode: 1, stdout, stderr };
	}
	return { flags };
}

// shared tail of runScan/runScanParallel: formats the scan result, writes the
// output file when -o is given, and reports parse problems on stderr
function finishScan(
	scan: ScanResult,
	flags: ScanFlags,
	notify: ((line: string) => void) | undefined,
	stdout: string[],
	stderr: string[],
): ScanOutcome {
	if (scan.largeDirectoryNotice !== undefined) {
		const lines = [
			`⚠ Scanning a large directory: ${scan.largeDirectoryNotice.fileCount} source files`,
			"This may take a while...",
		];
		if (notify) {
			for (const line of lines) {
				notify(line);
			}
		} else {
			stdout.push(...lines);
			stdout.push("");
		}
	}

	// "classic" (explicitly or via config) is the built-in default report
	if (flags.format !== undefined && flags.format !== "classic") {
		const text = formatOutput(stripNotice(scan), { format: flags.format });
		if (flags.output !== undefined) {
			try {
				mkdirSync(dirname(flags.output), { recursive: true });
				writeFileSync(flags.output, `${text}\n`, "utf8");
			} catch (writeError) {
				stderr.push(
					`envgraph scan: could not write ${flags.output}: ${writeError instanceof Error ? writeError.message : String(writeError)}`,
				);
				return { exitCode: 1, stdout, stderr };
			}
			stdout.push(`✓ Written to ${flags.output}`);
		} else {
			stdout.push(text);
		}
		for (const scanError of scan.errors) {
			stderr.push(
				`envgraph scan: could not parse ${scanError.file}: ${scanError.message}`,
			);
		}
		return { exitCode: 0, stdout, stderr, raw: flags.output === undefined };
	}

	const classic = formatClassicReport(scan, stderr);
	return { exitCode: classic.exitCode, stdout: [...stdout, ...classic.stdout], stderr };
}

export type { ScanFlags } from "./scan-flags.ts";
export { parseScanFlags } from "./scan-flags.ts";
export { DIRECTORY_ENTRY_LIMIT } from "./scan-guard.ts";