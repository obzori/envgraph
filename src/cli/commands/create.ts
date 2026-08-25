import type { EnvGraphCommand } from "./types.ts";
import { s, stylizeLine } from "../style.ts";
import { confirmSync } from "../prompt.ts";
import { banner, rule } from "../ui.ts";
import { createExample } from "./create-example.ts";
import type { CreateOutcome } from "./create-example.ts";

// Re-exports so existing imports (`createExample`, `buildConfigTemplate`,
// `detectProjectLanguage`, `createConfig`, types) keep working.
export { createExample, IMPORTANT_WARNING } from "./create-example.ts";
export { createConfig, buildConfigTemplate, detectProjectLanguage } from "./create-config.ts";
export type { CreateExampleOptions, CreateOutcome } from "./create-example.ts";
export type { CreateConfigOptions, CreateConfigOutcome } from "./create-config.ts";

/**
 * CLI command wrapper. Binds the pure {@link createExample} to real process
 * state: prints the banner, writes the outcome, and adds the closing rule.
 */
export const createCommand: EnvGraphCommand = {
	name: "create",
	description: "Generate scaffold files (e.g. .env.example from .env, or envgraph.config).",
	usage: "envgraph create <example|config> [--force] [--dry-run] [--ts|--js]",
	run(args: readonly string[]): number {
		const outcome: CreateOutcome = createExample(args, {
			cwd: process.cwd(),
			force: args.includes("--force") || args.includes("-f"),
			interactive: Boolean(process.stdin?.isTTY),
			prompt: confirmSync,
			dryRun: args.includes("--dry-run") || args.includes("-d"),
		});

		for (const line of banner("envgraph create", "scaffold generators")) {
			process.stdout.write(`${line}\n`);
		}
		for (const line of outcome.stdout) {
			process.stdout.write(`${stylizeLine(line)}\n`);
		}
		if (outcome.wrote) {
			const line = rule();
			if (line.length > 0) process.stdout.write(`${line}\n`);
		}
		for (const line of outcome.stderr) {
			process.stderr.write(`${s.error(line)}\n`);
		}

		return outcome.exitCode;
	},
};