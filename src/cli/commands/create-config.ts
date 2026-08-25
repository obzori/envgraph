import { existsSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CreateExampleOptions } from "./create-example.ts";

export interface CreateConfigOptions extends CreateExampleOptions {}

export interface CreateConfigOutcome {
	readonly exitCode: number;
	readonly stdout: readonly string[];
	readonly stderr: readonly string[];
	/** Whether a config file was written. */
	readonly wrote: boolean;
	/** Name of the config file that would be/was written. */
	readonly fileName?: string;
}

/** Template for a generated `envgraph.config.<ts|mjs>`. */
export function buildConfigTemplate(ts: boolean): string {
	const body = `/**
 * envgraph configuration.
 *
 * Recognized keys:
 *  - ui: "pretty" (default, with rules and banners) or "minimal"
 *    (same layout, without the horizontal rules).
 *  - outputFormat: default output format for \`envgraph scan\`
 *    ("classic" (the human-readable report), "json", "table" or
 *    "mermaid"). The --format flag on the command line overrides
 *    this value.
 *  - include: glob patterns restricting which files are scanned,
 *    e.g. ["src/**/*.ts"]. Default: every .js/.jsx/.ts/.tsx file.
 *  - exclude: glob patterns of files to skip even when included,
 *    e.g. ["**/generated/**"]. Default skips node_modules/dist/build.
 *  - example.keepComments: keep comments from .env in the generated
 *    .env.example (default: true).
 *  - example.defaults: default values written into .env.example instead of
 *    the sanitized values from .env, e.g.
 *    { DISCORD_TOKEN: "enter_here_your_discord_token" }.
 */
export default {
	// ui: "pretty",
	// outputFormat: "table",
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
	// .mjs so the ESM export works even in CommonJS projects
	const fileName =
		language === "ts" ? "envgraph.config.ts" : "envgraph.config.mjs";
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