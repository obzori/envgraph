import { readFileSync } from "node:fs";
import { discoverEnvFiles, discoverSourceFiles } from "../../filesystem/index.ts";
import { findEnvAccesses, findEnvLoaders } from "./ast.ts";
import type { EnvLoader, EnvSource } from "./ast.ts";

/** One recorded usage site of an environment variable. */
export interface EnvVarLocation {
	readonly file: string;
	readonly line: number;
	readonly source?: EnvSource;
}

/** An environment variable together with every location it is used in. */
export interface EnvVarUsage {
	readonly name: string;
	readonly locations: readonly EnvVarLocation[];
}

/** Result of scanning a project. */
export interface ScanResult {
	/**
	 * Detected environment variable usages (e.g. `process.env.PORT`), sorted
	 * by name; each with all usage locations.
	 */
	readonly variables: readonly EnvVarUsage[];
	/**
	 * Detected environment loading mechanisms (dotenv, `process.loadEnvFile`),
	 * sorted by file then line. Kept separate from {@link variables}: loading
	 * an `.env` file and reading a variable are different concepts.
	 */
	readonly loaders: readonly (EnvLoader & { readonly file: string })[];
	/** `.env*` files found in the project, as paths relative to the root. */
	readonly envFiles: readonly string[];
	/** Files that could not be parsed, with the reason. No source contents. */
	readonly errors: readonly ScanError[];
	/**
	 * Present when the scanned directory exceeded
	 * {@link LARGE_DIRECTORY_FILE_THRESHOLD}: the CLI prints a ⚠ warning about
	 * this.
	 */
	readonly largeDirectoryNotice?: { readonly fileCount: number };
}

/** A file-level scan error (e.g. a syntax error). Never includes source text. */
export interface ScanError {
	readonly file: string;
	readonly message: string;
}

/**
 * A directory with more than this many source files is considered "large" and
 * triggers the ⚠ scanning notice before parsing starts.
 */
export const LARGE_DIRECTORY_FILE_THRESHOLD = 10_000;

export interface ScanOptions {
	/**
	 * Called once, right after source-file discovery and before any file is
	 * read or parsed, when the number of discovered files exceeds the
	 * large-directory threshold. Use it to warn the user that the scan may
	 * take a while.
	 */
	readonly onLargeDirectory?: (fileCount: number) => void;
	/** Overrides the large-directory threshold (used by tests). */
	readonly largeDirectoryThreshold?: number;
}

/**
 * Scan a project for statically detectable `process.env` usages.
 */
export function scanProject(root: string, options?: ScanOptions): ScanResult {
	const byName = new Map<string, EnvVarLocation[]>();
	const loaders: (EnvLoader & { readonly file: string })[] = [];
	const errors: ScanError[] = [];

	let warned = false;
	const threshold =
		options?.largeDirectoryThreshold ?? LARGE_DIRECTORY_FILE_THRESHOLD;

	const files = discoverSourceFiles(root, (count) => {
		// Fire once, mid-walk, as soon as the threshold is crossed so the
		// warning appears before the (possibly very long) traversal ends.
		if (!warned && count > threshold) {
			warned = true;
			options?.onLargeDirectory?.(count);
		}
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