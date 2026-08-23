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

/**
 * Render per-command help. Used automatically by the CLI dispatcher when a
 * command receives `-h` / `--help`, so every command supports it without
 * implementing it itself.
 */
export function printCommandHelp(command: EnvGraphCommand): void {
	const lines: string[] = [];
	lines.push(s.brand(command.name) + " — " + command.description);
	lines.push("");
	lines.push(s.heading("Usage:"));
	lines.push(`  ${command.usage}`);
	lines.push("");
	lines.push(
		`Run ${s.brand("envgraph --help")} to see all commands.`,
	);
	process.stdout.write(lines.join("\n") + "\n");
}
