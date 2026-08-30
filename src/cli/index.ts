#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import chalk from "chalk";
import { s } from "./style.ts";
import { commands, findCommand } from "./commands/index.ts";
import { printHelp, printCommandHelp } from "./commands/help.ts";
import { printVersion } from "./commands/version.ts";
import { loadConfig, getConfigPath, setConfigUi } from "../config/index.ts";

// CLI entry point: loads envgraph.config so every command sees the effective
// configuration, then dispatches to the matching command. Kept free of side
// effects (besides config loading) for isolated testing.
export async function run(argv: readonly string[]): Promise<number> {
	const cwd = process.cwd();
	await loadConfig(cwd, (message) => {
		process.stderr.write(`${s.error(message)}\n`);
	});

	// found above cwd -> hint where the settings come from
	const configPath = getConfigPath();
	if (configPath !== undefined && path.dirname(configPath) !== path.resolve(cwd)) {
		process.stderr.write(
			`${s.dim(`envgraph: using config from ${path.relative(cwd, configPath)}`)}\n`,
		);
	}

	const args = argv.slice(2);

	// global --minimal flag: same as `ui: "minimal"` in the config
	const minimal = args.includes("--minimal");
	if (minimal) {
		setConfigUi("minimal");
	}
	const cleanArgs = args.filter((a) => a !== "--minimal");

	if (cleanArgs.length === 0) {
		const entry = findCommand("envgraph");
		if (entry === undefined) {
			return 1;
		}
		return (await entry.load()).run([]);
	}

	const [first = "", ...rest] = cleanArgs;

	if (first === "-h" || first === "--help") {
		printHelp(commands);
		return 0;
	}

	if (first === "-v" || first === "--version") {
		printVersion();
		return 0;
	}

	const entry = findCommand(first);
	if (entry) {
		// Every command automatically supports -h/--help with a unified view;
		// per-command help renders from the static registry metadata and
		// loads no command modules.
		if (rest.includes("--help") || rest.includes("-h")) {
			printCommandHelp(entry);
			return 0;
		}
		const command = await entry.load();
		return await command.run(rest);
	}

	process.stderr.write(
		`${s.error(`envgraph: unknown command "${chalk.bold(first)}".`)}\n\n`,
	);
	printHelp(commands);
	return 1;
}

// true when this module is executed directly as a CLI rather than imported.
// Node canonicalizes import.meta.url to the real entry path, so process.argv[1]
// (possibly an npm-link symlink/junction or bin shim) must be compared against
// that real path.
function isEntryPoint(): boolean {
	const entry = process.argv[1];
	if (entry === undefined) {
		return false;
	}
	try {
		return realpathSync(entry) === fileURLToPath(import.meta.url);
	} catch {
		return pathToFileURL(entry).href === import.meta.url;
	}
}

if (isEntryPoint()) {
	process.exitCode = await run(process.argv);
}
