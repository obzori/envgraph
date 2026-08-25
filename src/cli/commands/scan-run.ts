import { scanProject } from "../../core/scanner/scanner.ts";
import { formatOutput } from "../../output/index.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseScanFlags } from "./scan-flags.ts";
import { checkLargeDirectory } from "./scan-guard.ts";
import { formatClassicReport, stripNotice } from "./scan-report.ts";

export interface ScanOutcome {
	readonly exitCode: number;
	readonly stdout: readonly string[];
	readonly stderr: readonly string[];
	/**
	 * True when stdout carries machine-readable/formatted content
	 * (`--format` was given) that must be printed verbatim, without
	 * CLI styling.
	 */
	readonly raw?: boolean;
}

export interface ScanRunOptions {
	notify?: (line: string) => void;
	/** Overrides DIRECTORY_ENTRY_LIMIT for the size guard (tests). */
	directoryEntryLimit?: number;
	/** Overrides the scanner's large-directory notice threshold (tests). */
	largeDirectoryThreshold?: number;
	/** Include globs (from `envgraph.config`); see {@link ScanOptions}. */
	include?: readonly string[];
	/** Exclude globs (from `envgraph.config`). */
	exclude?: readonly string[];
}

/**
 * Implement `envgraph scan`.
 *
 * Pure w.r.t. process state — returns an outcome; printing is done by the
 * command wrapper. Async-free so it can run in a worker thread while the
 * main thread animates a spinner.
 */
export function runScan(
	args: readonly string[],
	root: string,
	options?: ScanRunOptions,
): ScanOutcome {
	const stdout: string[] = [];
	const stderr: string[] = [];

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
	const { format, output } = flags;
	const notify = options?.notify;

	if (checkLargeDirectory(root, args, stderr, notify, options?.directoryEntryLimit)) {
		return { exitCode: 1, stdout, stderr };
	}

	const scan = scanProject(root, {
		largeDirectoryThreshold: options?.largeDirectoryThreshold,
		include: options?.include,
		exclude: options?.exclude,
	});

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
	if (format !== undefined && format !== "classic") {
		const text = formatOutput(stripNotice(scan), { format });
		if (output !== undefined) {
			try {
				mkdirSync(dirname(output), { recursive: true });
				writeFileSync(output, `${text}\n`, "utf8");
			} catch (writeError) {
				stderr.push(
					`envgraph scan: could not write ${output}: ${writeError instanceof Error ? writeError.message : String(writeError)}`,
				);
				return { exitCode: 1, stdout, stderr };
			}
			stdout.push(`✓ Written to ${output}`);
		} else {
			stdout.push(text);
		}
		for (const scanError of scan.errors) {
			stderr.push(
				`envgraph scan: could not parse ${scanError.file}: ${scanError.message}`,
			);
		}
		return { exitCode: 0, stdout, stderr, raw: output === undefined };
	}

	const classic = formatClassicReport(scan, stderr);
	return { exitCode: classic.exitCode, stdout: [...stdout, ...classic.stdout], stderr };
}

export type { ScanFlags } from "./scan-flags.ts";
export { parseScanFlags } from "./scan-flags.ts";
export { DIRECTORY_ENTRY_LIMIT } from "./scan-guard.ts";