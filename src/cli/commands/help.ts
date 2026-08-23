import chalk from "chalk";
import { s } from "../style.ts";
import type { EnvGraphCommand } from "./types.ts";

/**
 * Render general help text for the given set of registered commands.
 */
export function printHelp(commands: readonly EnvGraphCommand[]): void {
	const lines: string[] = [];
	lines.push(`${s.brand("envgraph")} — map environment variables to the files that use them.`);
	lines.push("");
	lines.push(s.heading("Usage:"));
	lines.push(`  ${s.brand("envgraph")} ${chalk.bold("[command]")} ${chalk.dim("[options]")}`);
	lines.push("");
	lines.push(s.heading("Commands:"));
	for (const command of commands) {
		lines.push(`  ${s.name(command.name.padEnd(10))}${command.description}`);
	}
	lines.push("");
	lines.push(s.heading("Options:"));
	lines.push(`  ${s.flag("-h")}, ${s.flag("--help")}     Show this help message.`);
	lines.push(`  ${s.flag("-v")}, ${s.flag("--version")}  Print the installed version.`);
	lines.push("");
	process.stdout.write(lines.join("\n") + "\n");
}
