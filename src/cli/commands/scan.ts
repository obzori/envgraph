import type { EnvGraphCommand } from "./types.ts";
import { s, stylizeLine } from "../style.ts";
import { isProjectRoot, findProjectRoot, hasConfigKey, getConfig } from "../../config/index.ts";
import { rule } from "../ui.ts";
import { Spinner } from "../spinner.ts";
import { runScan, runScanParallel } from "./scan-run.ts";
import type { ScanOutcome } from "./scan-run.ts";

// Re-exports so existing imports (`runScan`, `parseScanFlags`,
// `DIRECTORY_ENTRY_LIMIT`, types) keep working.
export { runScan } from "./scan-run.ts";
export { parseScanFlags } from "./scan-flags.ts";
export { DIRECTORY_ENTRY_LIMIT } from "./scan-guard.ts";
export type { ScanOutcome, ScanRunOptions } from "./scan-run.ts";
export type { ScanFlags } from "./scan-flags.ts";

// CLI wrapper around runScan: banner + spinner + closing rule
export const scanCommand: EnvGraphCommand = {
	name: "scan",
	description: "Detect process.env usages in the project's source files.",
	usage:
		"envgraph scan [--force] [--format classic|json|table|mermaid] [-o <file>]",
	async run(args: readonly string[]): Promise<number> {
		const cwd = process.cwd();

		// scanning a subfolder gives a partial graph; nudge the user
		if (!isProjectRoot(cwd) && findProjectRoot(cwd) !== undefined) {
			process.stderr.write(
				`${s.dim("envgraph: run from the project root to include the whole graph")}\n`,
			);
		}

		// outputFormat from envgraph.config becomes the default format;
		// an explicit --format flag always wins
		let effectiveArgs = args;
		if (
			hasConfigKey("outputFormat") &&
			!args.some(
				(a) => a === "--format" || a === "-F" || a.startsWith("--format="),
			)
		) {
			effectiveArgs = [...args, "--format", getConfig().outputFormat];
		}

		const spinner = new Spinner(`scanning ${cwd}`);
		spinner.start();
		// live counter: the walk reports matched source files, and the spinner
		// line turns into "scanning ... (N files)" while discovery runs
		const onFileDiscovered = (count: number): void => {
			spinner.updateText(`scanning ${cwd} (${count.toLocaleString("en-US")} files)`);
		};
		let outcome: ScanOutcome;
		try {
			// heavy parse runs in a worker pool (off the event loop), so the
			// spinner keeps animating while the pool scans in parallel;
			// include/exclude globs come from the config loaded in this thread
			// (the pool workers have no config cache of their own)
			const config = getConfig();
			const scanOptions = {
				include: config.include,
				exclude: config.exclude,
				onFileDiscovered,
			};
			outcome = await runScanParallel(effectiveArgs, cwd, scanOptions);
		} catch {
			// the pool is unavailable (e.g. worker_threads restricted) —
			// fall back to the synchronous path, still a correct result
			const config = getConfig();
			outcome = runScan(effectiveArgs, cwd, {
				include: config.include,
				exclude: config.exclude,
				onFileDiscovered,
			});
		}
		spinner.stop(outcome.exitCode === 0);

		for (const line of outcome.stdout) {
			process.stdout.write(
				`${outcome.raw ? line : stylizeLine(line)}\n`,
			);
		}
		for (const line of outcome.stderr) {
			process.stderr.write(`${s.error(line)}\n`);
		}
		if (!outcome.raw && outcome.exitCode === 0) {
			const line = rule();
			if (line.length > 0) process.stdout.write(`${line}\n`);
		}

		return outcome.exitCode;
	},
};