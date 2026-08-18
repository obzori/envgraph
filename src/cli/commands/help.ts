import type { EnvGraphCommand } from "./types.ts";

/**
 * Render general help text for the given set of registered commands.
 */
export function printHelp(commands: readonly EnvGraphCommand[]): void {
	const lines: string[] = [];
	lines.push("envgraph — map environment variables to the files that use them.");
	lines.push("");
	lines.push("Usage:");
	lines.push("  envgraph [command] [options]");
	lines.push("");
	lines.push("Commands:");
	for (const command of commands) {
		lines.push(`  ${command.name.padEnd(10)}${command.description}`);
	}
	lines.push("");
	lines.push("Options:");
	lines.push("  -h, --help     Show this help message.");
	lines.push("  -v, --version  Print the installed version.");
	lines.push("");
	process.stdout.write(lines.join("\n") + "\n");
}
