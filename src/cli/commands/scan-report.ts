import { s } from "../style.ts";
import type { ScanResult } from "../../core/scanner/scanner.ts";

/** Drop the transient large-directory notice before serializing/rendering. */
export function stripNotice(result: ScanResult): ScanResult {
	if (result.largeDirectoryNotice === undefined) {
		return result;
	}
	const { largeDirectoryNotice: _ignored, ...rest } = result;
	void _ignored;
	return rest;
}

/**
 * Render the classic human-readable scan report. Returns the stdout lines;
 * parse errors go on `stderr`.
 */
export function formatClassicReport(
	result: ScanResult,
	stderr: string[],
): { stdout: string[]; exitCode: number } {
	const stdout: string[] = [];

	if (result.variables.length === 0 && result.loaders.length === 0) {
		stdout.push("No environment variables found.");
		return { stdout, exitCode: 0 };
	}

	const total = result.variables.reduce(
		(sum, variable) => sum + variable.locations.length,
		0,
	);
	stdout.push(`${total} usages · ${result.variables.length} variables`);
	if (result.loaders.length > 0) {
		stdout.push(`${result.loaders.length} env loaders`);
	}
	stdout.push("");

	const nameWidth = Math.max(
		...result.variables.map((variable) => variable.name.length),
	);
	for (const variable of result.variables) {
		const sources = new Set(
			variable.locations
				.map((location) => location.source)
				.filter((source): source is NonNullable<typeof source> => source !== undefined),
		);
		const sourceTag =
			sources.size > 0 ? ` ${s.dim(`[${[...sources].join(",")}]`)}` : "";
		const primary = variable.locations[0];
		const location =
			primary !== undefined ? `${primary.file}:${primary.line}` : "";
		const countSuffix =
			variable.locations.length > 1 ? ` ×${variable.locations.length}` : "";
		stdout.push(
			`${variable.name.padEnd(nameWidth)}  ${location}${sourceTag}${countSuffix}`,
		);
	}

	if (result.loaders.length > 0) {
		stdout.push("");
		stdout.push("Environment loaders");
		const kindWidth = Math.max(
			...result.loaders.map((loader) => loader.kind.length),
		);
		for (const loader of result.loaders) {
			const target = loader.envFile !== undefined ? ` → ${loader.envFile}` : "";
			stdout.push(
				`${loader.kind.padEnd(kindWidth)}  ${loader.file}:${loader.line}${target}`,
			);
		}
	}

	if (result.envFiles.length > 0) {
		stdout.push("");
		stdout.push(".env files");
		for (const envFile of result.envFiles) {
			stdout.push(envFile);
		}
	}

	for (const error of result.errors) {
		stderr.push(`envgraph scan: could not parse ${error.file}: ${error.message}`);
	}

	return { stdout, exitCode: 0 };
}