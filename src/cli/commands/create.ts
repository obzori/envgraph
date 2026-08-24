import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { EnvGraphCommand } from "./types.ts";
import { s, stylizeLine } from "../style.ts";
import { buildExampleContent } from "../../core/env/generator.ts";
import { confirmSync } from "../prompt.ts";
import { getConfig } from "../../config/index.ts";

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
		// Handled centrally by the CLI dispatcher; kept for direct library use.
		stdout.push("Usage: envgraph create example [--force] [--dry-run]");
		stdout.push("Generate a .env.example from the project's .env file.");
		return { exitCode: 0, stdout, stderr, wrote: false };
	}

	if (positional.length === 0) {
		stderr.push(
			"envgraph create: unknown or missing generator. Available: example, config",
		);
		return { exitCode: 1, stdout, stderr, wrote: false };
	}

	if (positional[0] === "config") {
		const outcome = createConfig(args.slice(1), {
			cwd: opts.cwd,
			force: opts.force,
			interactive: opts.interactive,
			prompt: opts.prompt,
			dryRun: opts.dryRun,
		});
		return { ...outcome, stdout: [...stdout, ...outcome.stdout], stderr: [...stderr, ...outcome.stderr] };
	}

	if (positional[0] !== "example") {
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
	const exampleContent = buildExampleContent(envContent, {
		keepComments: getConfig().example.keepComments,
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

/**
 * Template for a generated `envgraph.config.ts`.
 */
export function buildConfigTemplate(ts: boolean): string {
	const body = `/**
 * envgraph configuration.
 *
 * Recognized keys:
 *  - example.keepComments: keep comments from .env in the generated
 *    .env.example (default: true).
 *  - example.defaults: default values written into .env.example instead of
 *    the sanitized values from .env, e.g. { NODE_ENV: "development" }.
 */
export default {
	example: {
		keepComments: true,
		defaults: {},
	},
};
`;
	if (!ts) {
		return `/** @type {import('envgraph').EnvGraphUserConfig} */\n${body}`;
	}
	return body;
}

/**
 * Decide whether the project is TypeScript-based: an explicit `--ts`/`--js`
 * flag wins, otherwise look for `tsconfig.json` or any `.ts`/`.mts` file in
 * the project root.
 */
export function detectProjectLanguage(
	cwd: string,
	flags: ReadonlySet<string>,
): "ts" | "js" {
	if (flags.has("--ts")) {
		return "ts";
	}
	if (flags.has("--js")) {
		return "js";
	}
	if (existsSync(path.join(cwd, "tsconfig.json"))) {
		return "ts";
	}
	try {
		return readdirSync(cwd).some((name) => /\.mts$|\.tsx?$/.test(name))
			? "ts"
			: "js";
	} catch {
		return "js";
	}
}

export interface CreateConfigOptions {
	readonly cwd: string;
	readonly force: boolean;
	readonly interactive: boolean;
	readonly prompt: (question: string) => boolean;
	readonly dryRun: boolean;
}

export interface CreateConfigOutcome {
	readonly exitCode: number;
	readonly stdout: readonly string[];
	readonly stderr: readonly string[];
	/** Whether a config file was written. */
	readonly wrote: boolean;
	/** Name of the config file that would be/was written, when known. */
	readonly fileName?: string;
}

/**
 * Implement `envgraph create config`.
 *
 * Pure w.r.t. process state; printing is performed by the command runner.
 */
export function createConfig(
	args: readonly string[],
	opts: CreateConfigOptions,
): CreateConfigOutcome {
	const stdout: string[] = [];
	const stderr: string[] = [];

	const flags = new Set(args.filter((a) => a.startsWith("-")));
	const language = detectProjectLanguage(opts.cwd, flags);
	const fileName = language === "ts" ? "envgraph.config.ts" : "envgraph.config.js";
	const content = buildConfigTemplate(language === "ts");
	const targetPath = path.join(opts.cwd, fileName);

	if (opts.dryRun) {
		stdout.push(`Dry run: ${fileName} would contain:`);
		stdout.push("");
		stdout.push(content);
		return { exitCode: 0, stdout, stderr, wrote: false, fileName };
	}

	if (existsSync(targetPath)) {
		if (!opts.force) {
			if (opts.interactive) {
				const confirmed = opts.prompt(`${fileName} already exists. Overwrite? [y/N] `);
				if (!confirmed) {
					stderr.push(`envgraph: ${fileName} not modified.`);
					return { exitCode: 0, stdout, stderr, wrote: false, fileName };
				}
			} else {
				stderr.push(
					`envgraph: ${fileName} already exists; use --force to overwrite or run in an interactive terminal.`,
				);
				return { exitCode: 1, stdout, stderr, wrote: false, fileName };
			}
		}
		writeFileSync(targetPath, content, "utf8");
		stdout.push(`✓ Overwrote ${fileName}`);
		return { exitCode: 0, stdout, stderr, wrote: true, fileName };
	}

	writeFileSync(targetPath, content, "utf8");
	stdout.push(`✓ Created ${fileName}`);
	return { exitCode: 0, stdout, stderr, wrote: true, fileName };
}

/**
 * CLI command wrapper. Binds {@link createExample} to real process state.
 */
export const createCommand: EnvGraphCommand = {
	name: "create",
	description: "Generate scaffold files (e.g. .env.example from .env, or envgraph.config).",
	usage: "envgraph create <example|config> [--force] [--dry-run] [--ts|--js]",
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
