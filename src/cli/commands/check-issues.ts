import { readFileSync } from "node:fs";
import { parseEnvFile } from "../../core/env/parser.ts";
import type { ScanResult } from "../../core/scanner/scanner.ts";

export interface CheckIssue {
	readonly kind: "missing" | "unused" | "duplicate";
	readonly name: string;
	readonly locations: readonly string[];
}

// name -> set of `file:${line}` locations
type DefinedMap = Map<string, Set<string>>;

// next line of `name=` in the env file, searching strictly AFTER `from`;
// takes pre-split lines so the file is not re-split per variable
function declarationLine(
	lines: readonly string[],
	name: string,
	from: number,
): number {
	const prefix = `${name}=`;
	for (let i = from + 1; i < lines.length; i++) {
		if (lines[i]?.startsWith(prefix)) {
			return i;
		}
	}
	return from;
}

// gather declared variables; `.env.example` templates are skipped
function collectDeclared(
	root: string,
	envFiles: readonly string[],
): { defined: DefinedMap; duplicates: Set<string> } {
	const defined = new Map<string, Set<string>>();
	const duplicates = new Set<string>();
	for (const rel of envFiles) {
		if (rel.endsWith(".example")) {
			continue; // template, not an actual environment
		}
		let source = "";
		try {
			source = readFileSync(`${root}/${rel}`, "utf8");
		} catch {
			continue;
		}
		const lines = source.split(/\r?\n/);
		let cursor = -1;
		for (const line of parseEnvFile(source)) {
			if (line.kind !== "assignment") continue;
			cursor = declarationLine(lines, line.name, cursor);
			const loc = `${rel}:${cursor + 1}`;
			let set = defined.get(line.name);
			if (set === undefined) {
				set = new Set();
				defined.set(line.name, set);
			}
			set.add(loc);
			if (set.size > 1) duplicates.add(line.name);
		}
	}
	return { defined, duplicates };
}

// cross-reference declared variables with actual usage -> sorted issue list;
// takes the scan result so the tree is not walked a second time
export function buildIssues(
	root: string,
	scan: ScanResult,
): { issues: CheckIssue[]; usedCount: number } {
	// .env.example is a template for committing, not an actual environment
	const envFiles = scan.envFiles.filter((f) => !f.endsWith(".example"));
	const { defined, duplicates } = collectDeclared(root, envFiles);
	const usedVars = scan.variables;
	const usedNames = new Set(usedVars.map((v) => v.name));

	const issues: CheckIssue[] = [];
	for (const variable of usedVars) {
		if (!defined.has(variable.name)) {
			issues.push({
				kind: "missing",
				name: variable.name,
				locations: variable.locations.map((l) => `${l.file}:${l.line}`),
			});
		}
	}
	for (const [name, locs] of defined) {
		if (!usedNames.has(name)) {
			issues.push({ kind: "unused", name, locations: [...locs] });
		}
	}
	for (const name of duplicates) {
		issues.push({
			kind: "duplicate",
			name,
			locations: [...(defined.get(name) ?? [])],
		});
	}
	issues.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));

	return { issues, usedCount: usedVars.length };
}

export type { DefinedMap };