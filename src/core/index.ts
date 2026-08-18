import type { AnalysisResult } from "../analysis/index.ts";
import { analyzeProject } from "../analysis/index.ts";
import type { EnvGraphConfig } from "../config/index.ts";

/**
 * Immutable bundle of everything a single `envgraph` run needs. This is the
 * seam the CLI hands off to; future analysis logic reads from here instead of
 * touching global state.
 */
export interface EnvGraphContext {
	/** Directory the analysis starts from. */
	readonly cwd: string;
	/** Effective configuration for this run. */
	readonly config: EnvGraphConfig;
}

/**
 * Construct a context for a run. Kept explicit so callers can inject
 * configuration and the working directory without global state.
 */
export function createContext(cwd: string, config: EnvGraphConfig): EnvGraphContext {
	return { cwd, config };
}

/**
 * Orchestrate a full run: filesystem discovery → analysis → output.
 *
 * Placeholder only. Once implemented this will:
 *  1. discover source files via `filesystem`,
 *  2. run `analysis.analyzeProject` over them,
 *  3. format and emit the result via `output`.
 */
export async function runEnvGraph(context: EnvGraphContext): Promise<AnalysisResult> {
	void context;
	return analyzeProject(context.cwd);
}
