#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { commands, envgraphCommand, findCommand } from "./commands/index.ts";
import { printHelp } from "./commands/help.ts";
import { printVersion } from "./commands/version.ts";

/**
 * Entry point for the `envgraph` CLI.
 *
 * Parses the raw process arguments, dispatches to the matching command, and
 * returns a process exit code. Kept free of side effects so it can be imported
 * and tested in isolation.
 */
export function run(argv: readonly string[]): number {
	const args = argv.slice(2);

	// No arguments: run the default `envgraph` command.
	if (args.length === 0) {
		return envgraphCommand.run([]);
	}

	const [first = "", ...rest] = args;

	if (first === "-h" || first === "--help") {
		printHelp(commands);
		return 0;
	}

	if (first === "-v" || first === "--version") {
		printVersion();
		return 0;
	}

	const command = findCommand(first);
	if (command) {
		return command.run(rest);
	}

	process.stderr.write(`envgraph: unknown command "${first}".\n\n`);
	printHelp(commands);
	return 1;
}

/**
 * Determine whether this module is being executed directly (as a CLI) rather
 * than imported as a library.
 *
 * Node canonicalizes `import.meta.url` to the real path of the entry file, so
 * `process.argv[1]` (which may pass through an `npm link` symlink/junction or
 * a `bin` shim) must be compared against that real path to match reliably.
 */
function isEntryPoint(): boolean {
	const entry = process.argv[1];
	if (entry === undefined) {
		return false;
	}
	try {
		return realpathSync(entry) === fileURLToPath(import.meta.url);
	} catch {
		// Fall back to a direct comparison if the entry file cannot be resolved.
		return pathToFileURL(entry).href === import.meta.url;
	}
}

// Only execute the CLI when this file is the actual entry point (i.e. run as a
// binary), not when it is imported as a module (e.g. from unit tests).
if (isEntryPoint()) {
	process.exitCode = run(process.argv);
}
