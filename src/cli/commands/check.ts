import type { EnvGraphCommand } from "./types.ts";
import { s } from "../style.ts";
import { scanProject } from "../../core/scanner/scanner.ts";
import type { ScanResult } from "../../core/scanner/scanner.ts";
import { parseEnvFile } from "../../core/env/parser.ts";
import { countEntries, discoverEnvFiles } from "../../filesystem/index.ts";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DIRECTORY_ENTRY_LIMIT } from "./scan.ts";
import { banner, rule } from "../ui.ts";

export interface CheckIssue {
	readonly kind: "missing" | "unused" | "duplicate";
	readonly name: string;
	readonly locations: readonly string[];
}

export interface CheckOutcome {
	readonly exitCode: number;
	readonly stdout: readonly string[];
	readonly stderr: readonly string[];
	readonly raw?: boolean;
	readonly issues?: readonly CheckIssue[];
}

interface CheckFlags {
	readonly format?: "json";
	readonly output?: string;
}

function parseCheckFlags(args: readonly string[]): {
	flags: CheckFlags;
	error?: string;
} {
	const flags: { format?: "json"; output?: string } = {};
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) continue;
		if (arg === "--format" || arg === "-F") {
			const value = args[i + 1];
			if (value !== "json") {
				return { flags, error: 'the --format flag supports only "json".' };
			}
			flags.format = "json";
			i++;
			continue;
		}
		if (arg.startsWith("--format=")) {
			if (arg.slice(9) !== "json") {
				return { flags, error: 'the --format flag supports only "json".' };
			}
			flags.format = "json";
			continue;
		}
		if (arg === "--output" || arg === "-o") {
			const value = args[i + 1];
			if (value === undefined || value.startsWith("--")) {
				return { flags, error: "the --output flag requires a file path." };
			}
			flags.output = value;
			i++;
			continue;
		}
		if (arg.startsWith("--output=")) {
			flags.output = arg.slice(9);
			continue;
		}
	}
	return { flags };
}

function stripNotice(result: ScanResult): ScanResult {
	if (result.largeDirectoryNotice === undefined) {
		return result;
	}
	const { largeDirectoryNotice: _ignored, ...rest } = result;
	void _ignored;
	return rest;
}


// next line of `name=` in the env file, searching strictly AFTER `from`
function declarationLine(source: string, name: string, from: number): number {
	const lines = source.split(/\r?\n/);
	for (let i = from + 1; i < lines.length; i++) {
		if (lines[i]?.startsWith(`${name}=`)) {
			return i;
		}
	}
	return from;
}

/**
 * Implement `envgraph check`.
 *
 * Compares variables declared in `.env*` files with those actually used via
 * `process.env` in the source tree:
 *  - missing:   used in code but not defined anywhere -> exit 1
 *  - unused:    declared but never referenced
 *  - duplicate: declared more than once across env files
 */
export function runCheck(
	args: readonly string[],
	root: string,
	options?: { notify?: (line: string) => void },
): CheckOutcome {
	const stdout: string[] = [];
	const stderr: string[] = [];

	if (args.includes("--help") || args.includes("-h")) {
		stdout.push("Usage: envgraph check [--format json] [-o <file>] [--force]");
		stdout.push("Compare .env declarations with actual process.env usage.");
		return { exitCode: 0, stdout, stderr };
	}

	const { flags, error } = parseCheckFlags(args);
	if (error !== undefined) {
		stderr.push(`envgraph check: ${error}`);
		return { exitCode: 1, stdout, stderr };
	}

	const force = args.includes("--force") || args.includes("-f");
	const size = countEntries(root, DIRECTORY_ENTRY_LIMIT);
	if (size.exceeded && !force) {
		stderr.push(
			`envgraph check: directory ${root} is too large to check (more than ${DIRECTORY_ENTRY_LIMIT} entries).`,
		);
		stderr.push("Run from a project root instead, or pass --force.");
		return { exitCode: 1, stdout, stderr };
	}
	if (size.exceeded && force && options?.notify) {
		options.notify("⚠ Checking a large directory: this may take a while...");
	}

	// .env.example is a template for committing, not an actual environment
	const envFiles = discoverEnvFiles(root).filter(
		(f) => !f.endsWith(".example"),
	);
	const defined = new Map<string, Set<string>>();
	const duplicates = new Set<string>();
	for (const rel of envFiles) {
		let source = "";
		try {
			source = readFileSync(`${root}/${rel}`, "utf8");
		} catch {
			continue;
		}
		let cursor = -1;
		for (const line of parseEnvFile(source)) {
			if (line.kind !== "assignment") continue;
			cursor = declarationLine(source, line.name, cursor);
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

	const result = scanProject(root);
	const usedVars = stripNotice(result).variables;
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

	const missing = issues.filter((i) => i.kind === "missing");
	const exitCode = missing.length > 0 ? 1 : 0;

	if (flags.format === "json") {
		const text = JSON.stringify({ ok: exitCode === 0, envFiles, issues }, null, 2);
		if (flags.output !== undefined) {
			try {
				mkdirSync(dirname(flags.output), { recursive: true });
				writeFileSync(flags.output, `${text}\n`, "utf8");
			} catch (writeError) {
				stderr.push(
					`envgraph check: could not write ${flags.output}: ${writeError instanceof Error ? writeError.message : String(writeError)}`,
				);
				return { exitCode: 1, stdout, stderr };
			}
			stdout.push(`✓ Written to ${flags.output}`);
			return { exitCode, stdout, stderr, issues };
		}
		return { exitCode, stdout: [text], stderr, raw: true, issues };
	}

	stdout.push(`${envFiles.length} env files · ${usedVars.length} variables in use`);
	if (envFiles.length === 0) {
		stdout.push("");
		stdout.push(`No .env files found in ${root}.`);
	}

	if (issues.length === 0) {
		stdout.push("");
		stdout.push(`${s.success("✓")} Everything checks out.`);
		return { exitCode, stdout, stderr, issues };
	}

	const kinds: Array<"missing" | "unused" | "duplicate"> = [
		"missing",
		"unused",
		"duplicate",
	];
	for (const kind of kinds) {
		const group = issues.filter((i) => i.kind === kind);
		if (group.length === 0) continue;
		stdout.push("");
		const badge =
			kind === "missing"
				? s.error("● MISSING")
				: s.warning(`○ ${kind.toUpperCase()}`);
		switch (kind) {
			case "missing":
				stdout.push(`${badge} ${s.dim("— used in code, not defined in any .env file:")}`);
				break;
			case "unused":
				stdout.push(`${badge} ${s.dim("— declared but never used:")}`);
				break;
			case "duplicate":
				stdout.push(`${badge} ${s.dim("— declared more than once:")}`);
				break;
		}
		const width = Math.max(...group.map((i) => i.name.length));
		for (const issue of group) {
			const [first, ...rest] = issue.locations;
			const extra = rest.length > 0 ? `  ${s.count(`+${rest.length} more`)}` : "";
			stdout.push(
				`  ${s.name(issue.name.padEnd(width))}  ${s.location(first ?? "")}${extra}`,
			);
		}
	}

	if (missing.length > 0) {
		stdout.push("");
		stdout.push(
			s.error(
				`${missing.length} missing variable${missing.length === 1 ? "" : "s"} — exit 1`,
			),
		);
	}

	return { exitCode, stdout, stderr, issues };
}

export const checkCommand: EnvGraphCommand = {
	name: "check",
	description: "Compare .env declarations with actual process.env usage.",
	usage: "envgraph check [--format json] [-o <file>] [--force]",
	run(args: readonly string[]): number {
		const outcome = runCheck(args, process.cwd(), {
			notify(line: string): void {
				process.stdout.write(`${s.warning(line)}\n`);
			},
		});
		if (!outcome.raw) {
			for (const line of banner(
				"envgraph check",
				`checking ${process.cwd()}`,
			)) {
				process.stdout.write(`${line}\n`);
			}
		}
		for (const line of outcome.stdout) {
			process.stdout.write(`${line}\n`);
		}
		if (!outcome.raw) {
			process.stdout.write(`${rule()}\n`);
		}
		for (const line of outcome.stderr) {
			process.stderr.write(`${s.error(line)}\n`);
		}
		return outcome.exitCode;
	},
};

