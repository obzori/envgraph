import type { OutputFormat } from "../output/index.ts";

/**
 * Effective configuration for an envgraph run.
 *
 * Defaults live in {@link DEFAULT_CONFIG}. Later this will be merged with
 * values from a user-supplied config file (`envgraph.config.{js,ts,json}`)
 * and CLI options.
 */
export interface EnvGraphConfig {
	/** Glob patterns for files to include in analysis. */
	readonly include: readonly string[];
	/** Glob patterns for files/directories to ignore. */
	readonly exclude: readonly string[];
	/** Default output format. */
	readonly outputFormat: OutputFormat;
}

export const DEFAULT_CONFIG: EnvGraphConfig = {
	include: ["**/*.{js,ts,jsx,tsx}"],
	exclude: ["**/node_modules/**", "**/dist/**", "**/build/**"],
	outputFormat: "json",
};

/**
 * Load configuration for a project rooted at `cwd`.
 *
 * Placeholder — returns the defaults. Future work will discover and parse a
 * config file, then deep-merge it with {@link DEFAULT_CONFIG} and CLI options.
 */
export async function loadConfig(cwd: string): Promise<EnvGraphConfig> {
	void cwd;
	return { ...DEFAULT_CONFIG };
}
