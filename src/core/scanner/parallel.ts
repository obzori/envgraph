import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { discoverProjectFiles } from "../../filesystem/index.ts";
import { LARGE_DIRECTORY_FILE_THRESHOLD } from "./scanner.ts";
import type {
	EnvVarLocation,
	ScanError,
	ScanOptions,
	ScanResult,
} from "./scanner.ts";
import type { EnvLoader } from "./ast.ts";
import type { ChunkResult } from "./parallel-worker.ts";

// one worker handles a batch of this many files before reporting and pulling
// the next batch — small enough to keep workers balanced, big enough that the
// per-batch message overhead stays negligible
const CHUNK_FILES = 64;
// Workers past this point pay more TypeScript load + thread contention than
// they recover in parse parallelism; 4 keeps the pool a win on both small
// multi-core dev machines and large CI workers (measured: on an 8-core host
// W=4≈W=8 for 20k files, on a 2-core host W=8 is actively slower than W=4).
const MAX_WORKERS = 4;

// the worker entry lives next to this module, so the sibling name resolves
// for both the compiled dist output (.js) and the dev source (.ts)
function workerModuleUrl(): string {
	const entry = import.meta.url;
	const ext = entry.endsWith(".ts") ? "ts" : "js";
	return `${entry.slice(0, entry.lastIndexOf("/") + 1)}parallel-worker.${ext}`;
}

// Results come back per chunk; the merge walks chunks in chunk order, which is
// the sorted file order of the discovery walk — so variable locations, loader
// order and error order are byte-for-byte identical to scanProject.
async function runPool(
	root: string,
	chunks: readonly string[][],
): Promise<readonly ChunkResult[]> {
	const workerCount = Math.min(
		availableParallelism(),
		MAX_WORKERS,
		chunks.length,
	);

	// round-robin assignment spreads alphabetical clusters of differently
	// sized files across workers instead of piling them up in the first one
	const byWorker: { index: number; files: string[] }[][] = Array.from(
		{ length: workerCount },
		() => [],
	);
	chunks.forEach((files, index) => {
		byWorker[index % workerCount]!.push({ index, files });
	});

	// the eval script imports the worker module and answers once per chunk;
	// one worker (with its cached TypeScript module) stays alive for all the
	// batches assigned to it, then exits when it has none left
	const script = `
import { parentPort, workerData } from "node:worker_threads";
const mod = await import(workerData.moduleUrl);
for (const { index, files } of workerData.chunks) {
	const payload = await mod.runChunk(workerData.root, files);
	parentPort.postMessage({ index, payload });
}
`;

	const moduleUrl = workerModuleUrl();
	const results = new Map<number, ChunkResult>();
	const workers: Worker[] = [];

	try {
		await new Promise<void>((resolve, reject) => {
			let remaining = chunks.length;
			let failed = false;

			for (const workerChunks of byWorker) {
				if (workerChunks.length === 0) {
					continue;
				}
				const worker = new Worker(script, {
					eval: true,
					workerData: { moduleUrl, root, chunks: workerChunks },
				});
				workers.push(worker);
				worker.on("message", (message: { index: number; payload: ChunkResult }) => {
					results.set(message.index, message.payload);
					remaining--;
					if (remaining === 0) {
						resolve();
					}
				});
				worker.on("error", (error) => {
					if (!failed) {
						failed = true;
						reject(error);
					}
				});
				worker.on("exit", (code) => {
					if (code !== 0 && !failed) {
						failed = true;
						reject(new Error(`pool worker exited with code ${code}`));
					}
				});
			}
		});
	} finally {
		for (const worker of workers) {
			void worker.terminate();
		}
	}

	const ordered: ChunkResult[] = [];
	for (let i = 0; i < chunks.length; i++) {
		const chunk = results.get(i);
		if (chunk === undefined) {
			throw new Error("worker pool returned incomplete results");
		}
		ordered.push(chunk);
	}
	return ordered;
}

// async parallel sibling of scanProject (same signature, same result shape):
// the walk and the merge run on the caller's thread, the per-file parse runs
// in a worker pool. Use it where the caller can afford an await — the CLI
// scan path — and keep scanProject for synchronous callers and tests.
export async function scanProjectParallel(
	root: string,
	options?: ScanOptions,
): Promise<ScanResult> {
	let warned = false;
	const threshold =
		options?.largeDirectoryThreshold ?? LARGE_DIRECTORY_FILE_THRESHOLD;

	// one walk collects both source files and .env* names, with the same
	// mid-walk large-directory warning as scanProject
	const { sources: files, envFiles } = discoverProjectFiles(root, {
		include: options?.include,
		exclude: options?.exclude,
		onFileDiscovered: (count) => {
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

	if (files.length === 0) {
		return {
			variables: [],
			loaders: [],
			envFiles,
			errors: [],
			scannedFiles: 0,
			largeDirectoryNotice,
		};
	}

	const chunks: string[][] = [];
	for (let i = 0; i < files.length; i += CHUNK_FILES) {
		chunks.push(files.slice(i, i + CHUNK_FILES));
	}

	const perChunk = await runPool(root, chunks);

	// merge in chunk order == the walk's sorted file order, mirroring the
	// exact building blocks scanProject uses for locations/loaders/errors
	const byName = new Map<string, EnvVarLocation[]>();
	const loaders: (EnvLoader & { readonly file: string })[] = [];
	const errors: ScanError[] = [];
	let scanned = 0;

	for (const chunk of perChunk) {
		scanned += chunk.scanned;
		for (const error of chunk.errors) {
			errors.push(error);
		}
		for (const loader of chunk.loaders) {
			loaders.push(loader);
		}
		for (const access of chunk.accesses) {
			const location: EnvVarLocation = {
				file: access.file,
				line: access.line,
				column: access.column,
				...(access.source !== undefined && access.source !== "process"
					? { source: access.source }
					: {}),
			};
			const locations = byName.get(access.name);
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

	return {
		variables,
		loaders,
		envFiles,
		errors,
		scannedFiles: scanned,
		largeDirectoryNotice,
	};
}