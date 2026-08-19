import { parseEnvFile } from "./parser.ts";
import { isSensitiveName, SENSITIZED_VALUE } from "./sanitizer.ts";

/**
 * Build the sanitized `.env.example` content from raw `.env` contents.
 *
 * Rules:
 *  - Sensitive variables are written with an empty value.
 *  - Safe values are preserved verbatim from the source (including quotes).
 *  - Comments, blank lines, and unknown raw lines are preserved in order.
 */
export function buildExampleContent(envContent: string): string {
	const lines = parseEnvFile(envContent);
	const out: string[] = [];

	for (const line of lines) {
		switch (line.kind) {
			case "blank":
				out.push("");
				break;
			case "comment":
				out.push(line.raw);
				break;
			case "raw":
				out.push(line.text);
				break;
			case "assignment": {
				out.push(
					isSensitiveName(line.name)
						? `${line.name}=${SENSITIZED_VALUE}`
						: `${line.name}=${line.value}`,
				);
				break;
			}
		}
	}

	return out.join("\n") + "\n";
}

// Re-exported so downstream modules get the full env API from one place.
export type { EnvLine } from "./parser.ts";
export { parseEnvFile } from "./parser.ts";
export { isSensitiveName, SENSITIVE_PATTERNS, SENSITIZED_VALUE } from "./sanitizer.ts";
