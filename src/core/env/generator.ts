import { parseEnvFile } from "./parser.ts";
import { isSensitiveName, SENSITIZED_VALUE } from "./sanitizer.ts";
import type { EnvGraphConfig } from "../../config/index.ts";

export interface BuildExampleOptions {
	readonly keepComments?: boolean;
}


export function buildExampleContent(
	envContent: string,
	options: BuildExampleOptions = {},
): string {
	const keepComments = options.keepComments ?? true;
	const lines = parseEnvFile(envContent);
	const out: string[] = [];

	for (const line of lines) {
		switch (line.kind) {
			case "blank":
				out.push("");
				break;
			case "comment":
				if (keepComments) {
					out.push(line.raw);
				}
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

/** Convenience overload taking the project's effective config section. */
export function buildExampleContentFromConfig(
	envContent: string,
	config: Pick<EnvGraphConfig, "example">,
): string {
	return buildExampleContent(envContent, {
		keepComments: config.example.keepComments,
	});
}

export type { EnvLine } from "./parser.ts";
export { parseEnvFile } from "./parser.ts";
export { isSensitiveName, SENSITIVE_PATTERNS, SENSITIZED_VALUE } from "./sanitizer.ts";
