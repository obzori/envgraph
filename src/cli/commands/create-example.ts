import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildExampleContent } from "../../core/env/generator.ts";
import { getConfig } from "../../config/index.ts";
import { createConfig } from "./create-config.ts";

/** Warning printed after every successful write of `.env.example`. */
export const IMPORTANT_WARNING: readonly string[] = [
	"IMPORTANT: CHECK .env.example BEFORE COMMITTING IT.",
	"Make sure it does not contain passwords, tokens, API keys,",
	"private keys, credentials, or other sensitive information.",
];

export interface CreateExampleOptions {
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
	/** Whether a file was written (created or overwritten). */
	readonly wrote: boolean;
}

/**
 * Implement `envgraph create <example|config>`.
 *
 * Pure w.r.t. process state: returns an outcome describing what would be/was
 * printed. The actual writing to stdout/stderr is performed by the command
 * runner so this function can be unit-tested without capturing global streams.
 */
export function createExample(
	args: readonly string[],
	opts: CreateExampleOptions,
): CreateOutcome {
	const stdout: string[] = [];
	const stderr: string[] = [];

	const flags = new Set(args.filter((a) => a.startsWith("-")));
	const positional = args.filter((a) => !a.startsWith("-"));

	if (flags.has("--help") || flags.has("-h")) {
		if (positional[0] === "config") {
			return createConfig(args.slice(1), opts);
		}
		stdout.push("Usage: envgraph create example [--force] [--dry-run]");
		stdout.push("Generate a .env.example from the project's .env file.");
		return { exitCode: 0, stdout, stderr, wrote: false };
	}

	const generator = positional[0];
	if (generator === undefined) {
		stderr.push(
			"envgraph create: unknown or missing generator. Available: example, config",
		);
		return { exitCode: 1, stdout, stderr, wrote: false };
	}

	if (generator === "config") {
		const outcome = createConfig(args.slice(1), opts);
		return { ...outcome, stdout: [...stdout, ...outcome.stdout], stderr: [...stderr, ...outcome.stderr] };
	}

	if (generator !== "example") {
		stderr.push(
			"envgraph create: unknown or missing generator. Available: example, config",
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
	const { keepComments, defaults } = getConfig().example;
	const exampleContent = buildExampleContent(envContent, {
		keepComments,
		defaults,
	});

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