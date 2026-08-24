import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const EXCLUDED_DIRECTORIES = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
]);

/**
 * Discover the set of source files under `root` that match the configured
 * include/exclude globs.
 *
 * @param onFileDiscovered Called during the walk with the running count of
 *   files found so far — lets callers warn about very large directories
 *   before the whole tree has been traversed.
*/
export function discoverSourceFiles(
	root: string,
	onFileDiscovered?: (count: number) => void,
): string[] {
	const results: string[] = [];

	function walk(dir: string): void {
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const relative = path.relative(root, path.join(dir, entry.name));
			if (entry.isDirectory()) {
				if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
					walk(path.join(dir, entry.name));
				}
			} else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
				results.push(relative.split(path.sep).join("/"));
				onFileDiscovered?.(results.length);
			}
		}
	}

	walk(root);
	return results.sort();
}

/**
 * True when a filename matches the common `.env*` convention used by dotenv
 * and Node.js: exactly `.env`, or `.env.<something>` (`.env.local`,
 * `.env.production`, `.env.example`, …). Names like `.environment`,
 * `env.txt`, or `something.env.backup` do not match.
 */
export function isEnvFileName(fileName: string): boolean {
	return fileName === ".env" || fileName.startsWith(".env.");
}

/**
 * Discover `.env*` files under `root` (same exclusions as source discovery).
 * Returns paths relative to `root`, sorted. Never reads file contents —
 * only names, so no secret values are ever touched.
 */
export function discoverEnvFiles(root: string): string[] {
	const results: string[] = [];

	function walk(dir: string): void {
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const relative = path.relative(root, path.join(dir, entry.name));
			if (entry.isDirectory()) {
				if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
					walk(path.join(dir, entry.name));
				}
			} else if (entry.isFile() && isEnvFileName(entry.name)) {
				results.push(relative.split(path.sep).join("/"));
			}
		}
	}

	walk(root);
	return results.sort();
}

/**
 * Cheaply estimate the size of a project tree: counts files and directories
 * under `root`, skipping {@link EXCLUDED_DIRECTORIES}, stopping as soon as
 * more than `limit` entries have been seen. Never reads file contents.
 */
export function countEntries(
	root: string,
	limit: number,
): { count: number; exceeded: boolean } {
	let count = 0;

	function walk(dir: string): void {
		if (count > limit) {
			return;
		}
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			count++;
			if (count > limit) {
				return;
			}
			if (entry.isDirectory() && !EXCLUDED_DIRECTORIES.has(entry.name)) {
				walk(path.join(dir, entry.name));
				if (count > limit) {
					return;
				}
			}
		}
	}

	walk(root);
	return { count, exceeded: count > limit };
}

/**
 * Read a `.env` file into a `key → value` map, or return `null` if the file
 * does not exist.
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
