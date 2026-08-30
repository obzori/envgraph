import { readFileSync } from "node:fs";
import { analyzeSource } from "./ast.ts";
import type { EnvAccess, EnvLoader } from "./ast.ts";

export interface ChunkError {
	readonly file: string;
	readonly message: string;
}

// Reduced per-batch result returned from a pool worker. Nothing but the final
// data crosses the thread boundary — no source contents, no AST objects.
export interface ChunkResult {
	readonly accesses: readonly (EnvAccess & { readonly file: string })[];
	readonly loaders: readonly (EnvLoader & { readonly file: string })[];
	readonly errors: readonly ChunkError[];
	readonly scanned: number;
}

// Parse one batch of source files inside the pool worker thread. Mirrors the
// per-file loop of scanProject exactly (read -> /env/i prefilter ->
// analyzeSource), so the merged result is identical to the synchronous path.
export function runChunk(root: string, files: readonly string[]): ChunkResult {
	const accesses: (EnvAccess & { readonly file: string })[] = [];
	const loaders: (EnvLoader & { readonly file: string })[] = [];
	const errors: ChunkError[] = [];
	let scanned = 0;

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

		try {
			// every statically-detectable construct literally spells "env"
			// (see scanner.ts); files without it skip the parse but still count
			if (/env/i.test(source)) {
				const analysis = analyzeSource(source);
				for (const access of analysis.accesses) {
					accesses.push({ ...access, file });
				}
				for (const loader of analysis.loaders) {
					loaders.push({ ...loader, file });
				}
			}
			scanned++;
		} catch (error) {
			errors.push({
				file,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return { accesses, loaders, errors, scanned };
}