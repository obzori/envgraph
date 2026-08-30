import type { CommandMeta, EnvGraphCommand } from "./types.ts";
import { printHelp } from "./help.ts";

// command registry; order here = order in help output.
// Adding a command: create a module in this folder, append an entry below.
//
// Modules load lazily via import() so the CLI shell stays cheap: help output
// renders from the static metadata alone, and a command's dependency graph
// (e.g. the TypeScript compiler API in the scanner) is only paid by runs
// that actually execute the command.
export interface CommandEntry extends CommandMeta {
	// loads the module that implements the command
	readonly load: () => Promise<EnvGraphCommand>;
}

const helpMeta: CommandMeta = {
	name: "help",
	description: "Show usage information.",
	usage: "envgraph help [command]",
};

const entries: readonly CommandEntry[] = [
	{
		name: "envgraph",
		description: "Check that envgraph is installed and working.",
		usage: "envgraph",
		load: () => import("./envgraph.ts").then((m) => m.envgraphCommand),
	},
	{
		name: "create",
		description:
			"Generate scaffold files (e.g. .env.example from .env, or envgraph.config).",
		usage: "envgraph create <example|config> [--force] [--dry-run] [--ts|--js]",
		load: () => import("./create.ts").then((m) => m.createCommand),
	},
	{
		name: "check",
		description: "Compare .env declarations with actual process.env usage.",
		usage: "envgraph check [--format json] [-o <file>] [--force]",
		load: () => import("./check.ts").then((m) => m.checkCommand),
	},
	{
		name: "scan",
		description: "Detect process.env usages in the project's source files.",
		usage:
			"envgraph scan [--force] [--format classic|json|table|mermaid] [-o <file>]",
		load: () => import("./scan.ts").then((m) => m.scanCommand),
	},
	{
		...helpMeta,
		load: async () => ({
			...helpMeta,
			run(): number {
				printHelp(entries);
				return 0;
			},
		}),
	},
	{
		name: "version",
		description: "Print the installed version.",
		usage: "envgraph version",
		load: () => import("./version.ts").then((m) => m.versionCommand),
	},
];

export const commands: readonly CommandEntry[] = entries;

export function findCommand(name: string): CommandEntry | undefined {
	return entries.find((entry) => entry.name === name);
}

export type { CommandMeta, EnvGraphCommand } from "./types.ts";
