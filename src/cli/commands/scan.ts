import type { EnvGraphCommand } from "./types.ts";
import { s, stylizeLine } from "../style.ts";
import { scanProject } from "../../core/scanner/scanner.ts";
import type { ScanOptions, ScanResult } from "../../core/scanner/scanner.ts";
import { countEntries } from "../../filesystem/index.ts";
import { formatOutput } from "../../output/index.ts";
import type { OutputFormat } from "../../output/index.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isProjectRoot, findProjectRoot, hasConfigKey, getConfig } from "../../config/index.ts";
import { banner, rule } from "../ui.ts";

/**
 * A tree with more than this many directory entries (files + folders,
 * excluding `node_modules`, `.git`, `dist`, `build`) is refused unless
 * `--force` is passed. The check is cheap and aborts early.
 */
export const DIRECTORY_ENTRY_LIMIT = 50_000;

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

const FORMATS: readonly OutputFormat[] = ["json", "table", "mermaid"];

interface ScanFlags {
	readonly format?: OutputFormat;
	readonly output?: string;
}

/** Parse `--format <fmt>` / `--format=<fmt>` and `-o/--output <file>`. */
export function parseScanFlags(args: readonly string[]): {
	flags: ScanFlags;
	error?: string;
} {
	const flags: { format?: OutputFormat; output?: string } = {};
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) {
			continue;
		}
		if (arg === "--format" || arg === "-F") {
			const value = args[i + 1];
			if (value === undefined || value.startsWith("--")) {
				return { flags, error: "the --format flag requires a value." };
			}
			if (!FORMATS.includes(value as OutputFormat)) {
				return {
					flags,
					error: `unknown format "${value}". Supported formats: ${FORMATS.join(", ")}.`,
				};
			}
			flags.format = value as OutputFormat;
			i++;
			continue;
		}
		if (arg.startsWith("--format=")) {
			const value = arg.slice("--format=".length);
			if (!FORMATS.includes(value as OutputFormat)) {
				return {
					flags,
					error: `unknown format "${value}". Supported formats: ${FORMATS.join(", ")}.`,
				};
			}
			flags.format = value as OutputFormat;
			continue;
		}
		if (arg === "--output" || arg === "-o") {
			const value = args[i + 1];
			if (value === undefined || value.startsWith("--")) {
				return { flags, error: "the --output flag requires a file path." };
			}
			flags.output = value;
			i++;
			continue;
		}
		if (arg.startsWith("--output=")) {
			flags.output = arg.slice("--output=".length);
			continue;
		}
	}
	return { flags };
}

/**
 * Drop the transient large-directory notice from a scan result: it is a
 * CLI-time warning, not part of the analysis data worth serializing.
 */
function stripNotice(result: ScanResult): ScanResult {
	if (result.largeDirectoryNotice === undefined) {
		return result;
	}
	const { largeDirectoryNotice: _ignored, ...rest } = result;
	void _ignored;
	return rest;
}

/**
 * Implement `envgraph scan`.
 */
export function runScan(
	args: readonly string[],
	root: string,
	options?: ScanOptions & {
		readonly notify?: (line: string) => void;
		readonly directoryEntryLimit?: number;
	},
): ScanOutcome {
	const stdout: string[] = [];
	const stderr: string[] = [];

	if (args.includes("--help") || args.includes("-h")) {
		// Handled centrally by the CLI dispatcher; kept for direct library use.
		stdout.push(
			"Usage: envgraph scan [--force] [--format json|table|mermaid] [-o <file>]",
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
	const { notify, ...scanOptions } = options ?? {};

	// Guard: refuse to scan absurdly large trees unless --force is given.
	const force = args.includes("--force") || args.includes("-f");
	const size = countEntries(
		root,
		options?.directoryEntryLimit ?? DIRECTORY_ENTRY_LIMIT,
	);
	if (size.exceeded && !force) {
		stderr.push(
			`envgraph scan: directory ${root} is too large to scan (more than ${DIRECTORY_ENTRY_LIMIT} entries).`,
		);
		stderr.push(
			"Run from a project root instead, or pass --force to scan anyway.",
		);
		return { exitCode: 1, stdout, stderr };
	}
	if (size.exceeded && force && notify) {
		notify("⚠ Scanning a large directory: this may take a while...");
	}

	const result = scanProject(root, scanOptions);

	if (result.largeDirectoryNotice !== undefined) {
		const lines = [
			`⚠ Scanning a large directory: ${result.largeDirectoryNotice.fileCount} source files`,
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

	if (format !== undefined) {
		const text = formatOutput(stripNotice(result), { format });
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
		for (const scanError of result.errors) {
			stderr.push(
				`envgraph scan: could not parse ${scanError.file}: ${scanError.message}`,
			);
		}
		return { exitCode: 0, stdout, stderr, raw: output === undefined };
	}

	if (result.variables.length === 0 && result.loaders.length === 0) {
		stdout.push("No environment variables found.");
		return { exitCode: 0, stdout, stderr };
	}

	const total = result.variables.reduce(
		(sum, variable) => sum + variable.locations.length,
		0,
	);
	stdout.push(`${total} usages · ${result.variables.length} variables`);
	if (result.loaders.length > 0) {
		stdout.push(`${result.loaders.length} env loaders`);
	}
	stdout.push("");

	const nameWidth = Math.max(
		...result.variables.map((variable) => variable.name.length),
	);
	for (const variable of result.variables) {
		const sources = new Set(
			variable.locations
				.map((location) => location.source)
				.filter((source): source is NonNullable<typeof source> => source !== undefined),
		);
		const sourceTag =
			sources.size > 0 ? ` ${s.dim(`[${[...sources].join(",")}]`)}` : "";
		const primary = variable.locations[0];
		const location =
			primary !== undefined ? `${primary.file}:${primary.line}` : "";
		const countSuffix =
			variable.locations.length > 1 ? ` ×${variable.locations.length}` : "";
		stdout.push(
			`${variable.name.padEnd(nameWidth)}  ${location}${sourceTag}${countSuffix}`,
		);
	}

	if (result.loaders.length > 0) {
		stdout.push("");
		stdout.push("Environment loaders");
		const kindWidth = Math.max(
			...result.loaders.map((loader) => loader.kind.length),
		);
		for (const loader of result.loaders) {
			const target = loader.envFile !== undefined ? ` → ${loader.envFile}` : "";
			stdout.push(
				`${loader.kind.padEnd(kindWidth)}  ${loader.file}:${loader.line}${target}`,
			);
		}
	}

	if (result.envFiles.length > 0) {
		stdout.push("");
		stdout.push(".env files");
		for (const envFile of result.envFiles) {
			stdout.push(envFile);
		}
	}

	for (const error of result.errors) {
		stderr.push(`envgraph scan: could not parse ${error.file}: ${error.message}`);
	}

	return { exitCode: 0, stdout, stderr };
}

/**
 * CLI command wrapper. Binds {@link runScan} to real process state.
 */
export const scanCommand: EnvGraphCommand = {
	name: "scan",
	description: "Detect process.env usages in the project's source files.",
	usage:
		"envgraph scan [--force] [--format json|table|mermaid] [-o <file>]",
	run(args: readonly string[]): number {
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

		const outcome = runScan(effectiveArgs, cwd, {
			// Print the large-directory notice live, before parsing starts.
			notify(line) {
				process.stdout.write(`${s.warning(line)}\n`);
			},
		});

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
			process.stdout.write(`${rule()}\n`);
		}

		return outcome.exitCode;
	},
};