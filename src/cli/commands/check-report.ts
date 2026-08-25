import { s } from "../style.ts";
import type { CheckIssue } from "./check-issues.ts";

const KIND_ORDER: Array<CheckIssue["kind"]> = ["missing", "unused", "duplicate"];

const HEADERS: Record<CheckIssue["kind"], string> = {
	missing: "— used in code, not defined in any .env file:",
	unused: "— declared but never used:",
	duplicate: "— declared more than once:",
};

// human-readable check report; missingCount drives the exit-code footer
export function formatCheckReport(
	issues: readonly CheckIssue[],
	envFileCount: number,
	usedCount: number,
	missingCount: number,
	root: string,
): string[] {
	const stdout: string[] = [];
	stdout.push(`${envFileCount} env files · ${usedCount} variables in use`);
	if (envFileCount === 0) {
		stdout.push("");
		stdout.push(`No .env files found in ${root}.`);
	}

	if (issues.length === 0) {
		stdout.push("");
		stdout.push(`${s.success("✓")} Everything checks out.`);
		return stdout;
	}

	for (const kind of KIND_ORDER) {
		const group = issues.filter((i) => i.kind === kind);
		if (group.length === 0) continue;
		stdout.push("");
		const badge =
			kind === "missing"
				? s.error("● MISSING")
				: s.warning(`○ ${kind.toUpperCase()}`);
		stdout.push(`${badge} ${s.dim(HEADERS[kind])}`);
		const width = Math.max(...group.map((i) => i.name.length));
		for (const issue of group) {
			const [first, ...rest] = issue.locations;
			const extra = rest.length > 0 ? `  ${s.count(`+${rest.length} more`)}` : "";
			stdout.push(
				`  ${s.name(issue.name.padEnd(width))}  ${s.location(first ?? "")}${extra}`,
			);
		}
	}

	if (missingCount > 0) {
		stdout.push("");
		stdout.push(
			s.error(
				`${missingCount} missing variable${missingCount === 1 ? "" : "s"} — exit 1`,
			),
		);
	}

	return stdout;
}