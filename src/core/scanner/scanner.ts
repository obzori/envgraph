import { readFileSync } from "node:fs";
import { discoverEnvFiles, discoverSourceFiles } from "../../filesystem/index.ts";
import { findEnvAccesses, findEnvLoaders } from "./ast.ts";
import type { EnvLoader, EnvSource } from "./ast.ts";

// usage of one environment variable
export interface EnvVarLocation {
	readonly file: string;
	readonly line: number;
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
	// include/exclude globs (relative POSIX paths) filtering scanned files
	readonly include?: readonly string[];
	readonly exclude?: readonly string[];
}

// scan a project for statically detectable process.env usages
export function scanProject(root: string, options?: ScanOptions): ScanResult {
	const byName = new Map<string, EnvVarLocation[]>();
	const loaders: (EnvLoader & { readonly file: string })[] = [];
	const errors: ScanError[] = [];

	let warned = false;
	const threshold =
		options?.largeDirectoryThreshold ?? LARGE_DIRECTORY_FILE_THRESHOLD;

	const files = discoverSourceFiles(root, {
		include: options?.include,
		exclude: options?.exclude,
		onFileDiscovered: (count) => {
			// Fire once, mid-walk, as soon as the threshold is crossed so the
			// warning appears before the (possibly very long) traversal ends.
			if (!warned && count > threshold) {
				warned = true;
				options?.onLargeDirectory?.(count);
			}
		},
	});

	const largeDirectoryNotice =
		files.length > threshold ? { fileCount: files.length } : undefined;
	if (largeDirectoryNotice && !warned) {
		warned = true;
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
			accesses = findEnvAccesses(source);
			for (const loader of findEnvLoaders(source)) {
				loaders.push({ ...loader, file });
			}
		} catch (error) {
			errors.push({
				file,
				message: error instanceof Error ? error.message : String(error),
			});
			continue;
		}

		for (const access of accesses) {
			const locations = byName.get(access.name);
			const location = {
				file,
				line: access.line,
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

	const envFiles = discoverEnvFiles(root);

	return { variables, loaders, envFiles, errors, largeDirectoryNotice };
}