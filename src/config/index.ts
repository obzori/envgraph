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

const PROJECT_MARKERS: readonly string[] = [".git", ".hg", ".svn", "package.json"];

// does this directory look like a project root
export function isProjectRoot(dir: string): boolean {
	return PROJECT_MARKERS.some((m) => existsSync(path.join(dir, m)));
}

// nearest ancestor (or the dir itself) that is a project root
export function findProjectRoot(startDir: string): string | undefined {
	let dir = path.resolve(startDir);
	for (;;) {
		if (isProjectRoot(dir)) {
			return dir;
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			return undefined;
		}
		dir = parent;
	}
}

// nearest wins; search stops at the project root (marker dir) or disk root
export function findConfigPath(startDir: string): string | undefined {
	let dir = path.resolve(startDir);

	for (;;) {
		for (const name of CONFIG_CANDIDATES) {
			const candidate = path.join(dir, name);
			if (existsSync(candidate)) {
				return candidate;
			}
		}

		if (isProjectRoot(dir)) {
			return undefined;
		}

		const parent = path.dirname(dir);
		if (parent === dir) {
			return undefined;
		}
		dir = parent;
	}
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
let cachedConfigPath: string | undefined;
// top-level keys explicitly set in the user's config file
let cachedUserKeys: ReadonlySet<string> = new Set();

export function getConfig(): EnvGraphConfig {
	return cachedConfig ?? DEFAULT_CONFIG;
}

// path of the config used by the last loadConfig call, if any
export function getConfigPath(): string | undefined {
	return cachedConfigPath;
}

// true when the loaded config file explicitly sets this key
export function hasConfigKey(key: string): boolean {
	return cachedUserKeys.has(key);
}

export async function loadConfig(
	cwd: string,
	onError?: (message: string) => void,
): Promise<EnvGraphConfig> {
	cachedConfig = undefined;
	cachedConfigPath = undefined;
	cachedUserKeys = new Set();

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
		cachedConfigPath = configPath;
		cachedUserKeys = new Set(
			Object.keys(user).filter(
				(k) => (user as Record<string, unknown>)[k] !== undefined,
			),
		);
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
