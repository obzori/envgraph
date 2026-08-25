import type { OutputFormat } from "../../output/index.ts";

/** All formats accepted by `scan --format` (including the default report). */
export const FORMATS: readonly OutputFormat[] = [
	"classic",
	"json",
	"table",
	"mermaid",
];

export interface ScanFlags {
	readonly format?: OutputFormat;
	readonly output?: string;
}

/** Parse `--format <fmt>` / `--format=<fmt>` and `-o/--output <file>`. */
export function parseScanFlags(args: readonly string[]): {
	flags: ScanFlags;
	error?: string;
} {
	const flags: { format?: OutputFormat; output?: string } = {};
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) {
			continue;
		}
		if (arg === "--format" || arg === "-F") {
			const value = args[i + 1];
			if (value === undefined || value.startsWith("--")) {
				return { flags, error: "the --format flag requires a value." };
			}
			if (!FORMATS.includes(value as OutputFormat)) {
				return {
					flags,
					error: `unknown format "${value}". Supported formats: ${FORMATS.join(", ")}.`,
				};
			}
			flags.format = value as OutputFormat;
			i++;
			continue;
		}
		if (arg.startsWith("--format=")) {
			const value = arg.slice("--format=".length);
			if (!FORMATS.includes(value as OutputFormat)) {
				return {
					flags,
					error: `unknown format "${value}". Supported formats: ${FORMATS.join(", ")}.`,
				};
			}
			flags.format = value as OutputFormat;
			continue;
		}
		if (arg === "--output" || arg === "-o") {
			const value = args[i + 1];
			if (value === undefined || value.startsWith("--")) {
				return { flags, error: "the --output flag requires a file path." };
			}
			flags.output = value;
			i++;
			continue;
		}
		if (arg.startsWith("--output=")) {
			flags.output = arg.slice("--output=".length);
			continue;
		}
	}
	return { flags };
}