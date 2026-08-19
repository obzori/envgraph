import { readSync } from "node:fs";

/**
 * Minimal synchronous yes/no confirmation prompt.
 *
 * Reads a single character from stdin. Callers are responsible for gating on
 * `process.stdin.isTTY` so this is only used in an interactive terminal — in a
 * non-interactive context the command should refuse to overwrite instead of
 * prompting, so this helper stays a focused primitive.
 *
 * Returns `true` only when the user answers with `y`/`Y`.
 */
export function confirmSync(question: string): boolean {
	process.stdout.write(question);
	const buffer = Buffer.alloc(1);

	try {
		const bytesRead = readSync(0, buffer, 0, 1, null);
		if (bytesRead === 0) {
			process.stdout.write("\n");
			return false;
		}
		process.stdout.write("\n");
		const answer = buffer.toString("utf8").trim().toLowerCase();
		return answer === "y";
	} catch {
		process.stdout.write("\n");
		return false;
	}
}
