import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
// directories never scanned; heuristic — the entry name alone decides, so the
// walk skips the whole subtree without recursing into it. Covers caches and
// build outputs that are never project source, regardless of nesting depth.
const EXCLUDED_DIRECTORIES = new Set([
	"node_modules",
	".git",
	".hg",
	".svn",
	"dist",
	"build",
	"out",
	"target",
	"coverage",
	".next",
	".nuxt",
	".svelte-kit",
	".turbo",
	".vercel",
	".parcel-cache",
	".cache",
	".npm",
	".yarn",
	".pnpm-store",
	"vendor",
	"bower_components",
	"Pods",
	"Library",
	"Applications",
	"DerivedData",
]);

// expand top-level {a,b} brace alternation into plain globs; nested braces
// supported, a lone brace is left as-is
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

// brace-expand and normalize one glob pattern (trailing "/" ignored,
// wildcard-less patterns e.g. "src" match everything under the directory)
function normalizeGlob(pattern: string): string[] {
	let glob = pattern.trim().replace(/^\.\//, "").replace(/\/+$/, "");
	if (glob === "") {
		glob = "**";
	}
	if (!/[*?{]/.test(glob)) {
		glob = `${glob}/**`;
	}
	return expandBraces(glob);
}

// glob match against a POSIX-style relative path
export function matchGlob(relativePath: string, pattern: string): boolean {
	return normalizeGlob(pattern).some((g) => regexFor(g).test(relativePath));
}

// compile an include/exclude glob list once per walk instead of re-expanding
// braces and re-normalizing the pattern for every visited file
function compileMatcher(
	patterns?: readonly string[],
): ((relativePath: string) => boolean) | undefined {
	if (patterns === undefined || patterns.length === 0) {
		return undefined;
	}
	const regexes = patterns
		.flatMap((pattern) => normalizeGlob(pattern))
		.map((g) => regexFor(g));
	return (relativePath) => regexes.some((regex) => regex.test(relativePath));
}

// include/exclude glob filters plus the discovery-progress callback
export interface SourceFileFilter {
	readonly include?: readonly string[];
	readonly exclude?: readonly string[];
	// called during the walk with the running count of files found so far
	readonly onFileDiscovered?: (count: number) => void;
}

// source files (with include/exclude applied) and .env* files, from one walk
export interface DiscoveredFiles {
	readonly sources: string[];
	readonly envFiles: string[];
}

// one filesystem walk collecting both source files and .env* file names;
// the scanner uses this instead of two separate full-tree traversals
export function discoverProjectFiles(
	root: string,
	options?: SourceFileFilter,
): DiscoveredFiles {
	const sources: string[] = [];
	const envFiles: string[] = [];
	const includeMatch = compileMatcher(options?.include);
	const excludeMatch = compileMatcher(options?.exclude);
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
			} else if (entry.isFile()) {
				if (isEnvFileName(entry.name)) {
					envFiles.push(relative);
				}
				if (
					SOURCE_EXTENSIONS.has(path.extname(entry.name)) &&
					(includeMatch?.(relative) ?? true) &&
					!(excludeMatch?.(relative) ?? false)
				) {
					sources.push(relative);
					onFileDiscovered?.(sources.length);
				}
			}
		}
	}

	walk(root);
	return { sources: sources.sort(), envFiles: envFiles.sort() };
}

export function discoverSourceFiles(
	root: string,
	options?: SourceFileFilter,
): string[] {
	return discoverProjectFiles(root, options).sources;
}

// matches dotenv/node convention: exactly .env or .env.<something>
export function isEnvFileName(fileName: string): boolean {
	return fileName === ".env" || fileName.startsWith(".env.");
}

// discover .env* files under root (same exclusions as source discovery);
// names only — contents are never read
export function discoverEnvFiles(root: string): string[] {
	return discoverProjectFiles(root).envFiles;
}

// cheaply estimate tree size under root, stopping after `limit` entries;
// never reads file contents
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

// read a .env file into a key -> value map; null when the file is missing
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

// resolve a relative path against a project root
export function toAbsolute(relativePath: string, root: string): string {
	return path.resolve(root, relativePath);
}
