export interface EnvVariableUsage {
	readonly variable: string;
	readonly file: string;
	readonly line: number;
	readonly column: number;
}

export interface AnalysisResult {
	readonly usages: readonly EnvVariableUsage[];
	readonly variables: readonly string[];
	readonly scannedFiles: number;
}

// placeholder; the working implementation is scanProject in core/scanner
export async function analyzeProject(root: string): Promise<AnalysisResult> {
	void root;
	return { usages: [], variables: [], scannedFiles: 0 };
}
