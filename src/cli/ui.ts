import chalk from "chalk";
import { s } from "./style.ts";

// shared UI primitives: rules, section headers, banners, bullets

export const ICONS = {
	ok: "✓",
	warn: "⚠",
	err: "✖",
	dot: "◆",
	arrow: "→",
} as const;

// terminal width, clamped to something readable
export function termWidth(): number {
	const cols = process.stdout.columns;
	if (typeof cols !== "number" || Number.isNaN(cols) || cols < 24) {
		return 80;
	}
	return Math.min(cols, 96);
}

const RULE_COLOR = "#3B3554";

// thin horizontal line across the terminal
export function rule(char = "─"): string {
	return chalk.hex(RULE_COLOR)(char.repeat(termWidth()));
}

// section header: `◆ Title ───────────────…`
export function section(title: string): string {
	const label = ` ${title} `;
	const fill = Math.max(termWidth() - 1 - label.length, 3);
	return `${s.brand(ICONS.dot)}${chalk.bold.hex("#EDE9FE")(label)}${chalk.hex(RULE_COLOR)("─".repeat(fill))}`;
}

// two-line banner used at the top of command output
export function banner(title: string, subtitle?: string): string[] {
	const lines = [
		`${s.brand(ICONS.dot)} ${s.brand(title)}`,
	];
	if (subtitle !== undefined && subtitle.length > 0) {
		lines.push(`  ${s.dim(subtitle)}`);
	}
	lines.push(rule());
	return lines;
}

// dim list bullet that survives alignment
export function bullet(text: string): string {
	return `${chalk.hex("#4C4670")("│")} ${text}`;
}
