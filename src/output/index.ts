export type OutputFormat = "json" | "table" | "mermaid";

export interface OutputOptions {
	readonly format: OutputFormat;
}

/**
 * Serialize an analysis result into the requested format.
 *
 * `json` is implemented; `table` and `mermaid` are placeholders that will be
 * added when the analysis result shape is finalized.
 */
export function formatOutput(data: unknown, options: OutputOptions): string {
	switch (options.format) {
		case "json":
			return JSON.stringify(data, null, 2);
		case "table":
		case "mermaid":
			return JSON.stringify(data, null, 2);
		default:
			return JSON.stringify(data, null, 2);
	}
}
