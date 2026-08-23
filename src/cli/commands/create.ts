import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { EnvGraphCommand } from "./types.ts";
import { s, stylizeLine } from "../style.ts";
import { buildExampleContent } from "../../core/env/generator.ts";
import { confirmSync } from "../prompt.ts";

/**
 * Warning printed after every successful write of `.env.example`. It is
 * intentionally explicit that the sanitizer is a heuristic and the file must
 * be checked before committing.
 */
const IMPORTANT_WARNING: readonly string[] = [
	"IMPORTANT: CHECK .env.example BEFORE COMMITTING IT.",
	"Make sure it does not contain passwords, tokens, API keys,",
	"private keys, credentials, or other sensitive information.",
];

export interface CreateOptions {
	readonly cwd: string;
	readonly force: boolean;
	readonly interactive: boolean;
	readonly prompt: (question: string) => boolean;
	readonly dryRun: boolean;
}

export interface CreateOutcome {
	readonly exitCode: number;
	readonly stdout: readonly string[];
	readonly stderr: readonly string[];
	/** Whether `.env.example` was written (created or overwritten). */
	readonly wrote: boolean;
}

/**
 * Implement `envgraph create example`.
 *
 * Pure w.r.t. process state: it takes a `cwd` and options and returns an outcome
 * describing what would be/was printed. The actual writing to stdout/stderr is
 * performed by the command runner so this function can be unit-tested without
 * capturing global streams.
 */
export function createExample(
	args: readonly string[],
	opts: CreateOptions,
): CreateOutcome {
	const stdout: string[] = [];
	const stderr: string[] = [];

	const flags = new Set(args.filter((a) => a.startsWith("-")));
	const positional = args.filter((a) => !a.startsWith("-"));

	if (flags.has("--help") || flags.has("-h")) {
		stdout.push("Usage: envgraph create example [--force] [--dry-run]");
		stdout.push("Generate a .env.example from the project's .env file.");
		return { exitCode: 0, stdout, stderr, wrote: false };
	}

	if (positional.length === 0 || positional[0] !== "example") {
		stderr.push(
			"envgraph create: unknown or missing generator. Available: example",
		);
		return { exitCode: 1, stdout, stderr, wrote: false };
	}

	const envPath = path.join(opts.cwd, ".env");
	const examplePath = path.join(opts.cwd, ".env.example");

	if (!existsSync(envPath)) {
		stderr.push(`envgraph: .env not found in ${opts.cwd}.`);
		return { exitCode: 1, stdout, stderr, wrote: false };
	}

	const envContent = readFileSync(envPath, "utf8");
	const exampleContent = buildExampleContent(envContent);

	if (opts.dryRun) {
		stdout.push("Dry run: .env.example would contain:");
		stdout.push("");
		stdout.push(exampleContent);
		stdout.push(""); 
		for (const line of IMPORTANT_WARNING) {
			stdout.push(line);
		}
		return { exitCode: 0, stdout, stderr, wrote: false };
	}

	if (existsSync(examplePath)) {
		if (!opts.force) {
			if (opts.interactive) {
				const confirmed = opts.prompt(
					`.env.example already exists. Overwrite? [y/N] `,
				);
				if (!confirmed) {
					stderr.push("envgraph: .env.example not modified.");
					return { exitCode: 0, stdout, stderr, wrote: false };
				}
			} else {
				stderr.push(
					"envgraph: .env.example already exists; use --force to overwrite or run in an interactive terminal.",
				);
				return { exitCode: 1, stdout, stderr, wrote: false };
			}
		}
	}

	writeFileSync(examplePath, exampleContent, "utf8");

	stdout.push("✓ Created .env.example");
	stdout.push("");
	for (const line of IMPORTANT_WARNING) {
		stdout.push(line);
	}

	return { exitCode: 0, stdout, stderr, wrote: true };
}

/**
 * CLI command wrapper. Binds {@link createExample} to real process state.
 */
export const createCommand: EnvGraphCommand = {
	name: "create",
	description: "Generate scaffold files (e.g. .env.example from .env).",
	usage: "envgraph create example [--force] [--dry-run]",
	run(args: readonly string[]): number {
		const outcome = createExample(args, {
			cwd: process.cwd(),
			force: args.includes("--force") || args.includes("-f"),
			interactive: Boolean(process.stdin?.isTTY),
			prompt: confirmSync,
			dryRun: args.includes("--dry-run") || args.includes("-d"), 
		});

		for (const line of outcome.stdout) {
			process.stdout.write(`${stylizeLine(line)}\n`);
		}
		for (const line of outcome.stderr) {
			process.stderr.write(`${s.error(line)}\n`);
		}

		return outcome.exitCode;
	},
};
