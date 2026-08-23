import chalk from "chalk";

// Colors
export const s = {
	brand: (text: string): string => chalk.bold.hex("#A78BFA")(text),
	heading: (text: string): string => chalk.bold.underline.hex("#E2E8F0")(text),
	success: (text: string): string => chalk.hex("#4ADE80")(text),
	warning: (text: string): string => chalk.hex("#FACC15")(text),
	error: (text: string): string => chalk.hex("#FB7185")(text),
	name: (text: string): string => chalk.hex("#818CF8")(text),
	location: (text: string): string => chalk.hex("#94A3B8")(text),
	count: (text: string): string => chalk.hex("#C084FC")(text),
	dim: (text: string): string => chalk.hex("#64748B")(text),
	flag: (text: string): string => chalk.hex("#FBBF24")(text),
};


export function stylizeLine(line: string): string {
	if (line === "") {
		return line;
	}
	if (line.startsWith("✓")) {
		return s.success(line);
	}
	if (line.startsWith("⚠")) {
		return s.warning(line);
	}
	if (/^\d+ usages · \d+ variables$/.test(line)) {
		return line.replace(
			/^(\d+) usages · (\d+) variables$/,
			(_m, u: string, v: string) =>
				`${chalk.bold(u)} ${s.dim("usages")} · ${chalk.bold(v)} ${s.dim("variables")}`,
		);
	}
	if (/^\d+ env loaders$/.test(line)) {
		return line.replace(/^(\d+)/, (n) => chalk.bold(n));
	}
	if (line === "Environment loaders" || line === ".env files") {
		return s.heading(line);
	}
	if (line.startsWith("IMPORTANT:") || line.startsWith("Make sure it does not")) {
		return s.warning(line);
	}
	if (line.startsWith("Usage:")) {
		return `${chalk.bold("Usage: ")}${line.slice("Usage:".length)}`;
	}
	if (line.startsWith("Dry run:")) {
		return `${s.flag("Dry run:")} ${line.slice("Dry run:".length).trim()}`;
	}

	// Variable/loader report rows: `NAME<pad>  file:line[ → target][ ×N]`.
	const row = /^(\S+)\s{2}(\S+:\d+)(.*)$/.exec(line);
	if (row?.[1] !== undefined && row[2] !== undefined && row[3] !== undefined) {
		const [rawName, rawLoc, rest] = [row[1], row[2], row[3]];
		const pad = line.slice(rawName.length, line.length - (rawLoc.length + rest.length));
		const styledRest = rest
			.replace(/(×\d+)/g, (c) => s.count(c))
			.replace(/(→ .*)$/, (t) => s.location(t));
		return `${s.name(rawName)}${pad}${s.location(rawLoc)}${styledRest}`;
	}

	return line;
}
