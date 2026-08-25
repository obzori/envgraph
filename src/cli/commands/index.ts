import type { EnvGraphCommand } from "./types.ts";
import { envgraphCommand } from "./envgraph.ts";
import { createCommand } from "./create.ts";
import { checkCommand } from "./check.ts";
import { versionCommand } from "./version.ts";
import { scanCommand } from "./scan.ts";
import { printHelp } from "./help.ts";

// command registry; order here = order in help output.
// Adding a command: create a module in this folder, append it below.
export const commands: readonly EnvGraphCommand[] = [
	envgraphCommand,
	createCommand,
	checkCommand,
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

export function findCommand(name: string): EnvGraphCommand | undefined {
	return commands.find((command) => command.name === name);
}

export { checkCommand, createCommand, envgraphCommand, scanCommand, versionCommand };
export type { EnvGraphCommand } from "./types.ts";

