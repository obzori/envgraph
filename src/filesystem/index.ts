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
 * Expand top-level `{a,b}` brace alternation into several plain globs.
 * Nested braces are supported; a lone `{`/`}` is left as-is.
 */
function expandBraces(pattern: string): string[] {
	const open = pattern.indexOf("{");
	if (open === -1) {
		return [pattern];
	}
	let depth = 0;
	let close = -1;
	for (let i = open; i < pattern.length; i++) {
		const ch = pattern[i];
		if (ch === "{") {
			depth++;
		} else if (ch === "}") {
			depth--;
			if (depth === 0) {
				close = i;
				break;
			}
		}
	}
	if (close === -1) {
		return [pattern];
	}
	const head = pattern.slice(0, open);
	const body = pattern.slice(open + 1, close);
	const tail = pattern.slice(close + 1);
	const parts: string[] = [];
	let current = "";
	let nested = 0;
	for (const ch of body) {
		if (ch === "{") {
			nested++;
		} else if (ch === "}") {
			nested--;
		}
		if (ch === "," && nested === 0) {
			parts.push(current);
			current = "";
		} else {
			current += ch;
		}
	}
	parts.push(current);
	return parts.flatMap((part) => expandBraces(head + part + tail));
}

function escapeRegex(ch: string): string {
	return /[.+^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

// Compile a brace-free glob into a RegExp matched against POSIX-style
// relative paths. `*` matches within one segment, `**` across segments,
// `?` a single non-separator character.
function compileGlob(glob: string): RegExp {
	let source = "";
	let i = 0;
	while (i < glob.length) {
		const ch = glob[i]!;
		if (ch === "*") {
			if (glob[i + 1] === "*") {
				let j = i + 2;
				while (glob[j] === "*") {
					j++;
				}
				if (glob[j] === "/") {
					source += "(?:[^/]*/)*";
					i = j + 1;
				} else {
					source += ".*";
					i = j;
				}
			} else {
				source += "[^/]*";
				i++;
			}
		} else if (ch === "?") {
			source += "[^/]";
			i++;
		} else {
			source += escapeRegex(ch);
			i++;
		}
	}
	return new RegExp(`^${source}$`);
}

const globCache = new Map<string, RegExp>();

function regexFor(glob: string): RegExp {
	const existing = globCache.get(glob);
	if (existing !== undefined) {
		return existing;
	}
	const compiled = compileGlob(glob);
	globCache.set(glob, compiled);
	return compiled;
}

/**
 * True when a POSIX-style relative path matches a glob pattern such as
 * "src" + "/**" + "/*.ts", "*.js" or "scripts/{dev,build}.mts". A trailing
 * "/" is ignored, and a pattern without any wildcard (e.g. "src") matches
 * every file under that directory.
 */
export function matchGlob(relativePath: string, pattern: string): boolean {
	let glob = pattern.trim().replace(/^\.\//, "").replace(/\/+$/, "");
	if (glob === "") {
		glob = "**";
	}
	if (!/[*?{]/.test(glob)) {
		glob = `${glob}/**`;
	}
	return expandBraces(glob).some((g) => regexFor(g).test(relativePath));
}

/** Include/exclude glob filters plus the discovery-progress callback. */
export interface SourceFileFilter {
	/** Glob patterns; a file must match at least one to be included. */
	readonly include?: readonly string[];
	/** Glob patterns; matching files are skipped even if included. */
	readonly exclude?: readonly string[];
	/**
	 * Called during the walk with the running count of files found so far —
	 * lets callers warn about very large directories before the whole tree
	 * has been traversed.
	 */
	readonly onFileDiscovered?: (count: number) => void;
}

/**
 * Discover the set of source files under `root` that match the configured
 * include/exclude globs.
 */
export function discoverSourceFiles(
	root: string,
	options?: SourceFileFilter,
): string[] {
	const results: string[] = [];
	const include = options?.include;
	const exclude = options?.exclude;
	const onFileDiscovered = options?.onFileDiscovered;

	function walk(dir: string): void {
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			const relative = path.relative(root, full).split(path.sep).join("/");
			if (entry.isDirectory()) {
				if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
					walk(full);
				}
			} else if (
				entry.isFile() &&
				SOURCE_EXTENSIONS.has(path.extname(entry.name)) &&
				(include === undefined ||
					include.length === 0 ||
					include.some((pattern) => matchGlob(relative, pattern))) &&
				!(exclude !== undefined && exclude.some((pattern) => matchGlob(relative, pattern)))
			) {
				results.push(relative);
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
