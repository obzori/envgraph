import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import path from "node:path";
import {
	DEFAULT_CONFIG,
	explicitKeys,
	mergeConfig,
} from "./defaults.ts";
import type { EnvGraphConfig, EnvGraphUserConfig, UiTheme } from "./defaults.ts";

export * from "./defaults.ts";

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

function toUserConfig(value: unknown): EnvGraphUserConfig {
	if (typeof value !== "object" || value === null) {
		return {};
	}
	return value as EnvGraphUserConfig;
}

// nearest package.json "type" for a directory; undefined when absent
function packageType(startDir: string): string | undefined {
	let dir = path.resolve(startDir);
	for (;;) {
		const pkgPath = path.join(dir, "package.json");
		if (existsSync(pkgPath)) {
			try {
				const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
					type?: string;
				};
				return pkg.type;
			} catch {
				return undefined;
			}
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			return undefined;
		}
		dir = parent;
	}
}

// true when a .js file would be loaded as CommonJS by Node
function isCommonJsJsFile(configPath: string): boolean {
	if (!/\.(js|cjs)$/.test(configPath)) {
		return false;
	}
	return packageType(path.dirname(configPath)) !== "module";
}

// fallback loader: evaluate the source directly, as ESM first (via a data
// URL, so package.json "type" is irrelevant), then as CommonJS
async function loadFromSource(source: string): Promise<EnvGraphUserConfig> {
	try {
		const esmUrl = `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
		const mod = (await import(esmUrl)) as { default?: unknown };
		return toUserConfig(mod.default ?? {});
	} catch {
		const sandbox = {
			module: { exports: {} as Record<string, unknown> },
			exports: {} as Record<string, unknown>,
		};
		runInNewContext(source, sandbox);
		return toUserConfig(sandbox.module.exports ?? sandbox.exports);
	}
}

let cachedConfig: EnvGraphConfig | undefined;
let cachedConfigPath: string | undefined;
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

// runtime override for the ui theme (e.g. the global --minimal flag)
export function setConfigUi(ui: UiTheme): void {
	cachedConfig = { ...(cachedConfig ?? DEFAULT_CONFIG), ui };
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
			const url = pathToFileURL(configPath).href;
			if (isCommonJsJsFile(configPath)) {
				// Node would load this as CommonJS and choke on ESM syntax;
				// evaluate the source directly instead (ESM first, then CJS)
				const source = readFileSync(configPath, "utf8");
				user = await loadFromSource(source);
			} else {
				try {
					const mod = (await import(url)) as { default?: unknown };
					user = toUserConfig(mod.default ?? {});
				} catch {
					const source = readFileSync(configPath, "utf8");
					user = await loadFromSource(source);
				}
			}
		}
		cachedConfig = mergeConfig(DEFAULT_CONFIG, user);
		cachedConfigPath = configPath;
		cachedUserKeys = explicitKeys(user);
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
