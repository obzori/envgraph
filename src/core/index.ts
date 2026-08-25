import type { AnalysisResult } from "../analysis/index.ts";
import { analyzeProject } from "../analysis/index.ts";
import type { EnvGraphConfig } from "../config/index.ts";

// everything one envgraph run needs; explicit construction, no global state
export interface EnvGraphContext {
	readonly cwd: string;
	readonly config: EnvGraphConfig;
}

export function createContext(cwd: string, config: EnvGraphConfig): EnvGraphContext {
	return { cwd, config };
}

// orchestrate a full run: discovery -> analysis -> output; placeholder only
export async function runEnvGraph(context: EnvGraphContext): Promise<AnalysisResult> {
	void context;
	return analyzeProject(context.cwd);
}
