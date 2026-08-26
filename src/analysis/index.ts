import { scanProject } from "../core/scanner/scanner.ts";

// one statically-detected env variable usage in source code
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

export interface AnalyzeOptions {
	// include/exclude globs (relative POSIX paths) filtering scanned files
	readonly include?: readonly string[];
	readonly exclude?: readonly string[];
}

// programmatic wrapper around scanProject; see core/scanner for detection
export function analyzeProject(
	root: string,
	options?: AnalyzeOptions,
): Promise<AnalysisResult> {
	const scan = scanProject(root, {
		include: options?.include,
		exclude: options?.exclude,
	});
	const usages = scan.variables.flatMap((variable) =>
		variable.locations.map((location) => ({
			variable: variable.name,
			file: location.file,
			line: location.line,
			column: location.column,
		})),
	);
	return Promise.resolve({
		usages,
		variables: scan.variables.map((variable) => variable.name),
		scannedFiles: scan.scannedFiles,
	});
}
