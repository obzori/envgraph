export interface EnvVariableUsage {
	/** Name of the environment variable, e.g. `DATABASE_URL`. */
	readonly variable: string;
	/** Absolute path to the file containing the usage. */
	readonly file: string;
	/** 1-based line number of the usage. */
	readonly line: number;
	/** 1-based column number of the usage. */
	readonly column: number;
}


export interface AnalysisResult {
	/** Every `process.env.*` / `import.meta.env.*` usage found. */
	readonly usages: readonly EnvVariableUsage[];
	/** The set of all environment variables referenced. */
	readonly variables: readonly string[];
	/** Number of source files scanned. */
	readonly scannedFiles: number;
}

export async function analyzeProject(root: string): Promise<AnalysisResult> {
	void root;
	return { usages: [], variables: [], scannedFiles: 0 };
}
