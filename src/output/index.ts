import type { ScanResult } from "../core/scanner/scanner.ts";

/** All output formats; `classic` is the human-readable default report. */
export type OutputFormat = "json" | "table" | "mermaid" | "classic";

/** Formats that can be serialized by {@link formatOutput}. */
export type SerializableOutputFormat = Exclude<OutputFormat, "classic">;

export interface OutputOptions {
	readonly format: SerializableOutputFormat;
}

/** Serialize an analysis result into the requested format. */
export function formatOutput(data: ScanResult, options: OutputOptions): string {
	switch (options.format) {
		case "json":
			return formatJson(data);
		case "table":
			return formatTable(data);
		case "mermaid":
			return formatMermaid(data);
		default:
			return formatJson(data);
	}
}

function formatJson(data: ScanResult): string {
	return JSON.stringify(
		{
			variables: data.variables,
			loaders: data.loaders,
			envFiles: data.envFiles,
			errors: data.errors,
			...(data.largeDirectoryNotice !== undefined
				? { largeDirectoryNotice: data.largeDirectoryNotice }
				: {}),
		},
		null,
		2,
	);
}

function formatTable(data: ScanResult): string {
	const lines: string[] = [];

	if (data.variables.length === 0 && data.loaders.length === 0) {
		lines.push("No environment variables found.");
		return lines.join("\n");
	}

	const total = data.variables.reduce(
		(sum, variable) => sum + variable.locations.length,
		0,
	);
	lines.push(`${total} usages · ${data.variables.length} variables`);
	lines.push("");
	lines.push("VARIABLE        LOCATIONS");
	for (const variable of data.variables) {
		const locations = variable.locations
			.map((location) => `${location.file}:${location.line}`)
			.join(", ");
		const countSuffix =
			variable.locations.length > 1 ? ` (${variable.locations.length})` : "";
		lines.push(`${variable.name.padEnd(16)}${locations}${countSuffix}`);
	}

	if (data.loaders.length > 0) {
		lines.push("");
		lines.push("Environment loaders");
		lines.push("KIND            LOCATION");
		for (const loader of data.loaders) {
			const target =
				loader.envFile !== undefined ? ` -> ${loader.envFile}` : "";
			lines.push(
				`${loader.kind.padEnd(16)}${loader.file}:${loader.line}${target}`,
			);
		}
	}

	if (data.envFiles.length > 0) {
		lines.push("");
		lines.push(".env files");
		for (const envFile of data.envFiles) {
			lines.push(envFile);
		}
	}

	return lines.join("\n");
}

/**
 * Render a Mermaid flowchart of the environment graph: each `.env*` file
 * feeds its loaders, which feed the source files that read variables.
 */
function formatMermaid(data: ScanResult): string {
	const lines: string[] = ["flowchart LR"];

	const nodeId = new Map<string, string>();
	let counter = 0;
	function nodeFor(label: string): string {
		const existing = nodeId.get(label);
		if (existing !== undefined) {
			return existing;
		}
		const id = `n${counter++}`;
		nodeId.set(label, id);
		// Quote labels so special characters (`:` in `file:line`) are safe.
		lines.push(`    ${id}["${label}"]`);
		return id;
	}

	if (
		data.variables.length === 0 &&
		data.loaders.length === 0 &&
		data.envFiles.length === 0
	) {
		lines.push('    empty["No environment variables found"]');
		return lines.join("\n");
	}

	for (const envFile of data.envFiles) {
		nodeFor(envFile);
	}

	// Loaders connect their `.env` file (when known) to the loading site.
	for (const loader of data.loaders) {
		const target = nodeFor(`${loader.file}:${loader.line}`);
		if (loader.envFile !== undefined) {
			lines.push(`    ${nodeId.get(loader.envFile)} --> ${target}`);
		}
	}

	// Variables connect every usage site to a shared variable node.
	for (const variable of data.variables) {
		const variableNode = nodeFor(variable.name);
		const seen = new Set<string>();
		for (const location of variable.locations) {
			const site = `${location.file}:${location.line}`;
			if (seen.has(site)) {
				continue;
			}
			seen.add(site);
			lines.push(`    ${variableNode} --- ${nodeFor(site)}`);
		}
	}

	return lines.join("\n");
}