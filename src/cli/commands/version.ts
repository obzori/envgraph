import chalk from "chalk";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { EnvGraphCommand } from "./types.ts";
import { s } from "../style.ts";

// version comes from the nearest package.json — three levels up both in
// development (src/cli/commands/) and in the published package (dist/...)
export function readVersion(): string {
	const here = fileURLToPath(import.meta.url);
	const packageJsonPath = path.resolve(path.dirname(here), "../../../package.json");
	const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
		version?: string;
	};
	return packageJson.version ?? "0.0.0";
}

export function printVersion(): void {
	process.stdout.write(`${s.brand("envgraph")} ${chalk.green(`v${readVersion()}`)}\n`);
}

export const versionCommand: EnvGraphCommand = {
	name: "version",
	description: "Print the installed version.",
	usage: "envgraph version",
	run(): number {
		printVersion();
		return 0;
	},
};
