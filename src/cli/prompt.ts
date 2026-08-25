import { readSync } from "node:fs";

// minimal sync yes/no prompt; caller must gate on TTY; true only for y/Y
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
