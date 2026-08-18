/**
 * A single detected usage of an environment variable in a source file.
 */
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

/**
 * The result of analyzing a project. The shape is designed to be easy to
 * format as JSON, a table, or a Mermaid graph.
 */
export interface AnalysisResult {
	/** Every `process.env.*` / `import.meta.env.*` usage found. */
	readonly usages: readonly EnvVariableUsage[];
	/** The set of all environment variables referenced. */
	readonly variables: readonly string[];
	/** Number of source files scanned. */
	readonly scannedFiles: number;
}

/**
 * Statically analyze a project rooted at `root`.
 *
 * Placeholder only. Future work will:
 *   - discover relevant source files via the filesystem module,
 *   - parse JS/TS into ASTs,
 *   - detect `process.env.FOO` and `import.meta.env.FOO` references,
 *   - flag unused and missing variables against `.env`/`.env.example`,
 *   - build dependency/file graphs for output.
 */
export async function analyzeProject(root: string): Promise<AnalysisResult> {
	void root;
	return { usages: [], variables: [], scannedFiles: 0 };
}
