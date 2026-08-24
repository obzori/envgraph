import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import type { OutputFormat } from "../output/index.ts";

export interface ExampleConfig {
	readonly keepComments: boolean;
	readonly defaults: Readonly<Record<string, string>>;
}

export interface EnvGraphConfig {
	readonly include: readonly string[];
	readonly exclude: readonly string[];
	readonly outputFormat: OutputFormat;
	readonly example: ExampleConfig;
}

export const DEFAULT_EXAMPLE_CONFIG: ExampleConfig = {
	keepComments: true,
	defaults: {},
};

export const DEFAULT_CONFIG: EnvGraphConfig = {
	include: ["**/*.{js,ts,jsx,tsx}"],
	exclude: ["**/node_modules/**", "**/dist/**", "**/build/**"],
	outputFormat: "json",
	example: DEFAULT_EXAMPLE_CONFIG,
};

export interface EnvGraphUserConfig {
	readonly include?: readonly string[];
	readonly exclude?: readonly string[];
	readonly outputFormat?: OutputFormat;
	readonly example?: {
		readonly keepComments?: boolean;
		readonly defaults?: Record<string, string>;
	};
}

const CONFIG_CANDIDATES: readonly string[] = [
	"envgraph.config.ts",
	"envgraph.config.mts",
	"envgraph.config.js",
	"envgraph.config.mjs",
	"envgraph.config.cjs",
	"envgraph.config.json",
];

export function findConfigPath(cwd: string): string | undefined {
	for (const name of CONFIG_CANDIDATES) {
		const candidate = path.join(cwd, name);
		if (existsSync(candidate)) {
			return candidate;
		}
	}
	return undefined;
}

function mergeConfig(user: EnvGraphUserConfig): EnvGraphConfig {
	return {
		include: user.include ?? DEFAULT_CONFIG.include,
		exclude: user.exclude ?? DEFAULT_CONFIG.exclude,
		outputFormat: user.outputFormat ?? DEFAULT_CONFIG.outputFormat,
		example: {
			keepComments:
				user.example?.keepComments ?? DEFAULT_CONFIG.example.keepComments,
			defaults: user.example?.defaults ?? DEFAULT_CONFIG.example.defaults,
		},
	};
}

function toUserConfig(value: unknown): EnvGraphUserConfig {
	if (typeof value !== "object" || value === null) {
		return {};
	}
	return value as EnvGraphUserConfig;
}

let cachedConfig: EnvGraphConfig | undefined;

export function getConfig(): EnvGraphConfig {
	return cachedConfig ?? DEFAULT_CONFIG;
}


export async function loadConfig(
	cwd: string,
	onError?: (message: string) => void,
): Promise<EnvGraphConfig> {
	cachedConfig = undefined;

	const configPath = findConfigPath(cwd);
	if (configPath === undefined) {
		return getConfig();
	}

	try {
		let user: EnvGraphUserConfig;
		if (configPath.endsWith(".json")) {
			user = toUserConfig(JSON.parse(readFileSync(configPath, "utf8")));
		} else {
			const mod = (await import(pathToFileURL(configPath).href)) as {
				default?: unknown;
			};
			user = toUserConfig(mod.default ?? {});
		}
		cachedConfig = mergeConfig(user);
	} catch (error) {
		onError?.(
			`envgraph: failed to load ${path.basename(configPath)}: ${
				error instanceof Error ? error.message : String(error)
			}. Using default configuration.`,
		);
		return getConfig();
	}

	return cachedConfig;
}
