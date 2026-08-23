import type { EnvGraphCommand } from "./types.ts";
import { scanProject } from "../../core/scanner/scanner.ts";
import type { ScanOptions } from "../../core/scanner/scanner.ts";
import { countEntries } from "../../filesystem/index.ts";

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
}

/**
 * Implement `envgraph scan`.
 *
 * Pure w.r.t. process state: scans the given root directory for statically
 * analyzable `process.env` usages and returns the lines to print. The command
 * runner below performs the actual output so this function can be unit-tested
 * without capturing global streams.
 */
export function runScan(
	args: readonly string[],
	root: string,
	options?: ScanOptions & {
		/**
		 * Called for each warning line as soon as it is produced (before the
		 * scan finishes). When provided, large-directory notices go here
		 * instead of the collected `stdout` lines so a real terminal sees them
		 * immediately.
		 */
		readonly notify?: (line: string) => void;
		/** Overrides the too-large-tree entry limit (used by tests). */
		readonly directoryEntryLimit?: number;
	},
): ScanOutcome {
	const stdout: string[] = [];
	const stderr: string[] = [];

	if (args.includes("--help") || args.includes("-h")) {
		stdout.push("Usage: envgraph scan [--force]");
		stdout.push("Scan the project for environment variables used via process.env.");
		return { exitCode: 0, stdout, stderr };
	}

	const { notify, ...scanOptions } = options ?? {};

	// Guard: refuse to scan absurdly large trees unless --force is given. The
	// check counts directory entries only (no file contents) and stops as soon
	// as the limit is exceeded, so it returns quickly even in huge trees.
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
		const primary = variable.locations[0];
		const location =
			primary !== undefined ? `${primary.file}:${primary.line}` : "";
		const countSuffix =
			variable.locations.length > 1 ? ` ×${variable.locations.length}` : "";
		stdout.push(
			`${variable.name.padEnd(nameWidth)}  ${location}${countSuffix}`,
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
	usage: "envgraph scan [--force]",
	run(args: readonly string[]): number {
		const outcome = runScan(args, process.cwd(), {
			// Print the large-directory notice live, before parsing starts.
			notify(line) {
				process.stdout.write(`${line}\n`);
			},
		});

		for (const line of outcome.stdout) {
			process.stdout.write(`${line}\n`);
		}
		for (const line of outcome.stderr) {
			process.stderr.write(`${line}\n`);
		}

		return outcome.exitCode;
	},
};