import { countEntries } from "../../filesystem/index.ts";

/**
 * A tree with more than this many directory entries (files + folders,
 * excluding `node_modules`, `.git`, `dist`, `build`) is refused unless
 * `--force` is passed. The check is cheap and aborts early.
 */
export const DIRECTORY_ENTRY_LIMIT = 50_000;

/**
 * Guard against absurdly large trees. Shared by `scan` and `check`.
 * Returns an error message (via `stderr`) when the scan is refused, or
 * `null` when it may proceed.
 */
export function checkLargeDirectory(
	root: string,
	args: readonly string[],
	stderr: string[],
	notify?: (line: string) => void,
	limit: number = DIRECTORY_ENTRY_LIMIT,
): boolean {
	const force = args.includes("--force") || args.includes("-f");
	const size = countEntries(root, limit);
	if (size.exceeded && !force) {
		stderr.push(
			`envgraph scan: directory ${root} is too large to scan (more than ${DIRECTORY_ENTRY_LIMIT} entries).`,
		);
		stderr.push(
			"Run from a project root instead, or pass --force to scan anyway.",
		);
		return true;
	}
	if (size.exceeded && force && notify) {
		notify("⚠ Scanning a large directory: this may take a while...");
	}
	return false;
}