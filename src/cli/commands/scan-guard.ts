import { countEntries } from "../../filesystem/index.ts";

// trees with more entries than this are refused unless --force
export const DIRECTORY_ENTRY_LIMIT = 50_000;

// shared by scan and check; true = scan refused (message already on stderr)
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