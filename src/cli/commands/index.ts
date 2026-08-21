import type { EnvGraphCommand } from "./types.ts";
import { envgraphCommand } from "./envgraph.ts";
import { createCommand } from "./create.ts";
import { versionCommand } from "./version.ts";
import { scanCommand } from "./scan.ts";
import { printHelp } from "./help.ts";

/**
 * Registry of all CLI subcommands.
 *
 * Adding a new command is just: create a module in this folder, then append it
 * to this array. Order here determines the order shown in help output.
 */
export const commands: readonly EnvGraphCommand[] = [
	envgraphCommand,
	createCommand,
	scanCommand,
	{
		name: "help",
		description: "Show usage information.",
		usage: "envgraph help [command]",
		run(): number {
			printHelp(commands);
			return 0;
		},
	},
	versionCommand,
];

/**
 * Look up a command by its name. Used by the CLI dispatcher.
 */
export function findCommand(name: string): EnvGraphCommand | undefined {
	return commands.find((command) => command.name === name);
}

export { createCommand, envgraphCommand, scanCommand, versionCommand };
export type { EnvGraphCommand } from "./types.ts";

