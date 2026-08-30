import { readFileSync } from "node:fs";
import { discoverProjectFiles } from "../../filesystem/index.ts";
import { analyzeSource } from "./ast.ts";
import type { EnvLoader, EnvSource } from "./ast.ts";

// usage of one environment variable
export interface EnvVarLocation {
	readonly file: string;
	readonly line: number;
	readonly column: number;
	readonly source?: EnvSource;
}

export interface EnvVarUsage {
	readonly name: string;
	readonly locations: readonly EnvVarLocation[];
}

export interface ScanResult {
	// detected usages (e.g. process.env.PORT), sorted by name
	readonly variables: readonly EnvVarUsage[];
	// loading mechanisms (dotenv, process.loadEnvFile), sorted by file/line;
	// kept separate from variables: loading and reading are different things
	readonly loaders: readonly (EnvLoader & { readonly file: string })[];
	// .env* files found in the project, relative to the root
	readonly envFiles: readonly string[];
	// files that could not be parsed; never contains source contents
	readonly errors: readonly ScanError[];
	// number of files read and parsed successfully
	readonly scannedFiles: number;
	// set when the directory exceeded LARGE_DIRECTORY_FILE_THRESHOLD
	readonly largeDirectoryNotice?: { readonly fileCount: number };
}

export interface ScanError {
	readonly file: string;
	readonly message: string;
}

// a directory with more source files than this triggers the scanning notice
export const LARGE_DIRECTORY_FILE_THRESHOLD = 10_000;

export interface ScanOptions {
	// called once when discovered file count crosses the large-directory
	// threshold, before any file is read or parsed
	readonly onLargeDirectory?: (fileCount: number) => void;
	readonly largeDirectoryThreshold?: number;
	// called during the file walk with the count of source files matched so
	// far; used for live progress UI (e.g. "scanning ... (N files)")
	readonly onFileDiscovered?: (fileCount: number) => void;
	// include/exclude globs (relative POSIX paths) filtering scanned files
	readonly include?: readonly string[];
	readonly exclude?: readonly string[];
}

// helper shared by scanProject and the CLI pool path: the per-file read +
// parse loop and the merge. `files`/`envFiles` must come from the same
// discoverProjectFiles call that produced options.include/exclude.
export function scanDiscoveredProject(
	root: string,
	files: readonly string[],
	envFiles: readonly string[],
	options?: ScanOptions,
): ScanResult {
	const byName = new Map<string, EnvVarLocation[]>();
	const loaders: (EnvLoader & { readonly file: string })[] = [];
	const errors: ScanError[] = [];
	let scanned = 0;

	const threshold =
		options?.largeDirectoryThreshold ?? LARGE_DIRECTORY_FILE_THRESHOLD;
	const largeDirectoryNotice =
		files.length > threshold ? { fileCount: files.length } : undefined;
	if (largeDirectoryNotice) {
		options?.onLargeDirectory?.(files.length);
	}

	for (const file of files) {
		let source: string;
		try {
			source = readFileSync(`${root}/${file}`, "utf8");
		} catch (error) {
			errors.push({
				file,
				message: error instanceof Error ? error.message : String(error),
			});
			continue;
		}

		let accesses;
		try {
			// one parse per file: accesses and loaders share a single AST walk.
			// Every statically-detectable construct ("process.env",
			// "import.meta.env", "Bun.env", "Deno.env", "dotenv", "loadEnvFile")
			// literally spells "env" in the source, so a file without it cannot
			// contain a match — skip the parse entirely (see
			// docs/limitations.md for the unicode-escape edge case)
			const analysis = /env/i.test(source)
				? analyzeSource(source)
				: { accesses: [], loaders: [] };
			accesses = analysis.accesses;
			for (const loader of analysis.loaders) {
				loaders.push({ ...loader, file });
			}
		} catch (error) {
			errors.push({
				file,
				message: error instanceof Error ? error.message : String(error),
			});
			continue;
		}
		scanned++;

		for (const access of accesses) {
			const locations = byName.get(access.name);
			const location = {
				file,
				line: access.line,
				column: access.column,
				...(access.source !== undefined && access.source !== "process"
					? { source: access.source }
					: {}),
			};
			if (locations) {
				locations.push(location);
			} else {
				byName.set(access.name, [location]);
			}
		}
	}

	const variables = [...byName.entries()]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([name, locations]) => ({ name, locations }));

	loaders.sort((a, b) =>
		a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line,
	);

	return { variables, loaders, envFiles, errors, scannedFiles: scanned, largeDirectoryNotice };
}

// scan a project for statically detectable process.env usages
export function scanProject(root: string, options?: ScanOptions): ScanResult {
	const {
		include,
		exclude,
		onFileDiscovered,
		onLargeDirectory,
		largeDirectoryThreshold,
	} = options ?? {};
	let warned = false;
	const threshold =
		largeDirectoryThreshold ?? LARGE_DIRECTORY_FILE_THRESHOLD;

	// one walk collects both the source files and the .env* file names
	const { sources: files, envFiles } = discoverProjectFiles(root, {
		include,
		exclude,
		onFileDiscovered: (count) => {
			onFileDiscovered?.(count);
			// Fire once, mid-walk, as soon as the threshold is crossed so the
			// warning appears before the (possibly very long) traversal ends.
			if (!warned && count > threshold) {
				warned = true;
				onLargeDirectory?.(count);
			}
		},
	});

	if (files.length > threshold && !warned) {
		warned = true;
		onLargeDirectory?.(files.length);
	}

	return scanDiscoveredProject(root, files, envFiles, options);
}