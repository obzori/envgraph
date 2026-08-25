import type { EnvGraphCommand } from "./types.ts";
import { s } from "../style.ts";
import { fileURLToPath } from "node:url";
import { banner, rule } from "../ui.ts";
import { Spinner } from "../spinner.ts";
import { runInWorker } from "../offload.ts";
import { runCheck } from "./check-run.ts";
import type { CheckOutcome } from "./check-run.ts";

// Re-exports so existing imports (`runCheck`, `CheckIssue`, types) keep working.
export { runCheck } from "./check-run.ts";
export type { CheckIssue } from "./check-issues.ts";
export type { CheckOutcome } from "./check-run.ts";

// CLI wrapper: runs the pure runCheck off-thread so a spinner can animate
export const checkCommand: EnvGraphCommand = {
	name: "check",
	description: "Compare .env declarations with actual process.env usage.",
	usage: "envgraph check [--format json] [-o <file>] [--force]",
	async run(args: readonly string[]): Promise<number> {
		const cwd = process.cwd();
		const spinner = new Spinner(`checking ${cwd}`);
		spinner.start();
		let outcome: CheckOutcome;
		try {
			outcome = await runInWorker<CheckOutcome>(
				fileURLToPath(import.meta.url).replace(/check\.ts$/, "check-run.ts"),
				"runCheck",
				[args, cwd],
			);
		} catch {
			outcome = runCheck(args, cwd);
		}
		spinner.stop(outcome.exitCode === 0);

		if (!outcome.raw) {
			for (const line of banner("envgraph check", `checking ${cwd}`)) {
				process.stdout.write(`${line}\n`);
			}
		}
		for (const line of outcome.stdout) {
			process.stdout.write(`${line}\n`);
		}
		if (!outcome.raw) {
			const line = rule();
			if (line.length > 0) process.stdout.write(`${line}\n`);
		}
		for (const line of outcome.stderr) {
			process.stderr.write(`${s.error(line)}\n`);
		}
		return outcome.exitCode;
	},
};