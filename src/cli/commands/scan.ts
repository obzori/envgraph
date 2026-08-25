import type { EnvGraphCommand } from "./types.ts";
import { s, stylizeLine } from "../style.ts";
import { fileURLToPath } from "node:url";
import { isProjectRoot, findProjectRoot, hasConfigKey, getConfig } from "../../config/index.ts";
import { banner, rule } from "../ui.ts";
import { Spinner } from "../spinner.ts";
import { runInWorker } from "../offload.ts";
import { runScan } from "./scan-run.ts";
import type { ScanOutcome } from "./scan-run.ts";

// Re-exports so existing imports (`runScan`, `parseScanFlags`,
// `DIRECTORY_ENTRY_LIMIT`, types) keep working.
export { runScan } from "./scan-run.ts";
export { parseScanFlags } from "./scan-flags.ts";
export { DIRECTORY_ENTRY_LIMIT } from "./scan-guard.ts";
export type { ScanOutcome, ScanRunOptions } from "./scan-run.ts";
export type { ScanFlags } from "./scan-flags.ts";

/**
 * CLI command wrapper. Binds the pure {@link runScan} to real process state:
 * prints the banner, runs the analysis off-thread so a spinner can animate,
 * and renders the closing rule.
 */
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
		let outcome: ScanOutcome;
		try {
			// heavy parse runs off-thread so the spinner keeps animating;
			// include/exclude globs come from the config loaded in this thread
			// (the worker has no config cache of its own)
			const config = getConfig();
			outcome = await runInWorker<ScanOutcome>(
				fileURLToPath(import.meta.url).replace(/scan\.ts$/, "scan-run.ts"),
				"runScan",
				[
					effectiveArgs,
					cwd,
					{ include: config.include, exclude: config.exclude },
				],
			);
		} catch {
			const config = getConfig();
			outcome = runScan(effectiveArgs, cwd, {
				include: config.include,
				exclude: config.exclude,
			});
		}
		spinner.stop(outcome.exitCode === 0);

		if (!outcome.raw) {
			for (const line of banner("envgraph scan", `scanning ${cwd}`)) {
				process.stdout.write(`${line}\n`);
			}
		}
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