import type { EnvGraphCommand } from "./types.ts";
import { scanProject } from "../../core/scanner/scanner.ts";

export interface ScanOutcome {
	readonly exitCode: number;
	readonly stdout: readonly string[];
	readonly stderr: readonly string[];
}

/**
 * Implement `envgraph scan`.
 *
 * Pure w.r.t. process state: scans the given root directory for statically
 * analyzable `process.env` usages and returns the lines to print. The command
 * runner below performs the actual output so this function can be unit-tested
 * without capturing global streams.
 */
export function runScan(args: readonly string[], root: string): ScanOutcome {
	const stdout: string[] = [];
	const stderr: string[] = [];

	if (args.includes("--help") || args.includes("-h")) {
		stdout.push("Usage: envgraph scan");
		stdout.push("Scan the project for environment variables used via process.env.");
		return { exitCode: 0, stdout, stderr };
	}

	const result = scanProject(root);

	if (result.variables.length === 0) {
		stdout.push("No environment variables found.");
		return { exitCode: 0, stdout, stderr };
	}

	const total = result.variables.reduce(
		(sum, variable) => sum + variable.locations.length,
		0,
	);
	stdout.push(`${total} usages · ${result.variables.length} variables`);
	stdout.push("");

	const nameWidth = Math.max(
		...result.variables.map((variable) => variable.name.length),
	);
	for (const variable of result.variables) {
		const primary = variable.locations[0];
		const location =
			primary !== undefined ? `${primary.file}:${primary.line}` : "";
		const countSuffix =
			variable.locations.length > 1 ? ` ×${variable.locations.length}` : "";
		stdout.push(
			`${variable.name.padEnd(nameWidth)}  ${location}${countSuffix}`,
		);
	}

	for (const error of result.errors) {
		stderr.push(`envgraph scan: could not parse ${error.file}: ${error.message}`);
	}

	return { exitCode: 0, stdout, stderr };
}

/**
 * CLI command wrapper. Binds {@link runScan} to real process state.
 */
export const scanCommand: EnvGraphCommand = {
	name: "scan",
	description: "Detect process.env usages in the project's source files.",
	usage: "envgraph scan",
	run(args: readonly string[]): number {
		const outcome = runScan(args, process.cwd());

		for (const line of outcome.stdout) {
			process.stdout.write(`${line}\n`);
		}
		for (const line of outcome.stderr) {
			process.stderr.write(`${line}\n`);
		}

		return outcome.exitCode;
	},
};