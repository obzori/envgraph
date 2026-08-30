import { scanProject, scanDiscoveredProject } from "../../core/scanner/scanner.ts";
import { scanDiscoveredProjectParallel } from "../../core/scanner/parallel.ts";
import { discoverProjectFiles } from "../../filesystem/index.ts";
import type { ScanResult, ScanOptions } from "../../core/scanner/scanner.ts";
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
	// live progress: called during the file walk with the count of matched
	// source files so far (drives "scanning ... (N files)" in the CLI)
	onFileDiscovered?: (fileCount: number) => void;
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
		onFileDiscovered: options?.onFileDiscovered,
	});

	return finishScan(scan, head.flags, notify, stdout, stderr);
}

// parallel variant used by the CLI: flags/guard/walk stay on the caller's
// thread; the per-file parse runs in a worker pool only once the tree is big
// enough to amortize the worker boot + TypeScript load (~100-150 ms on typical
// hosts). Small projects skip the pool entirely and use the sync path — it is
// faster there and avoids paying that fixed cost every time.
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

	const scanOptions: ScanOptions = {
		largeDirectoryThreshold: options?.largeDirectoryThreshold,
		include: options?.include,
		exclude: options?.exclude,
	};

	// one walk; the pool path reuses the discovered files instead of walking
	// the tree again
	const { sources: files, envFiles } = discoverProjectFiles(root, {
		include: options?.include,
		exclude: options?.exclude,
		onFileDiscovered: options?.onFileDiscovered,
	});

	let scan: ScanResult;
	if (files.length < PARALLEL_MIN_FILES) {
		scan = scanDiscoveredProject(root, files, envFiles, scanOptions);
	} else {
		try {
			// the pool is unavailable or failed — fall back to the proven sync path
			scan = await scanDiscoveredProjectParallel(
				root,
				files,
				envFiles,
				scanOptions,
			);
		} catch {
			scan = scanDiscoveredProject(root, files, envFiles, scanOptions);
		}
	}

	return finishScan(scan, head.flags, notify, stdout, stderr);
}

// below this many source files the sync scan is faster than spawning the pool
export const PARALLEL_MIN_FILES = 10_000;

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