import chalk from "chalk";
import { s } from "../style.ts";
import { banner, rule, section } from "../ui.ts";
import type { CommandMeta } from "./types.ts";
import { readVersion } from "./version.ts";

// general help for all registered commands
export function printHelp(commands: readonly CommandMeta[]): void {
	const lines: string[] = [];
	lines.push(...banner(`envgraph ${chalk.dim("v" + readVersion())}`, "map environment variables to the files that use them"));
	lines.push("");
	lines.push(section("Usage:"));
	lines.push(`  ${s.brand("envgraph")} ${chalk.bold("[command]")} ${chalk.dim("[options]")}`);
	lines.push("");
	lines.push(section("Commands"));
	for (const command of commands) {
		lines.push(`  ${s.name(command.name.padEnd(10))}${chalk.hex("#94A3B8")(command.description)}`);
	}
	lines.push("");
	lines.push(section("Options"));
	lines.push(`  ${s.flag("-h")}, ${s.flag("--help")}     Show this help message.`);
	lines.push(`  ${s.flag("-v")}, ${s.flag("--version")}  Print the installed version.`);
	lines.push(`  ${s.flag("--minimal")}          Hide rules and banners for this run.`);
	lines.push("");
	lines.push(s.dim(`  Run ${chalk.hex("#F0ABFC")("envgraph <command> --help")} for details on a command.`));
	lines.push(rule());
	process.stdout.write(lines.join("\n") + "\n");
}

// per-command help; dispatched automatically for -h/--help
export function printCommandHelp(command: CommandMeta): void {
	const lines: string[] = [];
	lines.push(...banner(`${command.name}`, command.description));
	lines.push("");
	lines.push(section("Usage:"));
	lines.push(`  ${chalk.bold(command.usage)}`);
	lines.push("");
	lines.push(s.dim(`Run ${s.brand("envgraph --help")} to see all commands.`));
	lines.push(rule());
	process.stdout.write(lines.join("\n") + "\n");
}

