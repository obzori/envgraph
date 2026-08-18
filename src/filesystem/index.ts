import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Locate the project root by walking up from `startDir` until a marker file
 * (e.g. `package.json` or a VCS root) is found.
 *
 * Placeholder — currently returns `startDir`. Future work will implement the
 * upward walk and fall back to `cwd` when nothing is found.
 */
export function findProjectRoot(startDir: string): string {
	void startDir;
	return startDir;
}

/**
 * Discover the set of source files under `root` that match the configured
 * include/exclude globs.
 *
 * Placeholder — returns an empty list.
 */
export function discoverSourceFiles(root: string): string[] {
	void root;
	return [];
}

/**
 * Read a `.env` file into a `key → value` map, or return `null` if the file
 * does not exist.
 *
 * This is intentionally a minimal parser (comments and blank lines only) and
 * will be extended for quoting, escapes, and multi-line values as the project
 * grows.
 */
export function readEnvFile(filePath: string): Map<string, string> | null {
	if (!existsSync(filePath)) {
		return null;
	}

	const content = readFileSync(filePath, "utf8");
	const result = new Map<string, string>();

	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#")) {
			continue;
		}
		const eqIndex = line.indexOf("=");
		if (eqIndex === -1) {
			continue;
		}
		const key = line.slice(0, eqIndex).trim();
		const value = line.slice(eqIndex + 1).trim();
		result.set(key, value);
	}

	return result;
}

/** Resolve a relative path against a project root. */
export function toAbsolute(relativePath: string, root: string): string {
	return path.resolve(root, relativePath);
}
