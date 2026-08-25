import chalk from "chalk";
import { s } from "./style.ts";

// simpleDotsScrolling spinner
const FRAMES: readonly string[] = [".  ", ".. ", "...", " ..", "  .", "   "];
const INTERVAL_MS = 200;

// animated progress line; inert when stdout is not a TTY (CI, pipes)
export class Spinner {
	private timer: ReturnType<typeof setInterval> | undefined;
	private frame = 0;
	private readonly text: string;

	constructor(text: string) {
		this.text = text;
	}

	start(): void {
		if (!process.stdout.isTTY) {
			return;
		}
		this.render();
		this.timer = setInterval(() => {
			this.frame = (this.frame + 1) % FRAMES.length;
			this.render();
		}, INTERVAL_MS);
	}

	private render(): void {
		const frame = FRAMES[this.frame] ?? FRAMES[0] ?? "   ";
		process.stdout.write(`\r${s.brand(frame)} ${chalk.hex("#94A3B8")(this.text)}`);
	}

	stop(ok = true): void {
		if (this.timer !== undefined) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
		if (!process.stdout.isTTY) {
			return;
		}
		const icon = ok ? s.success("✓") : s.error("✖");
		process.stdout.write(`\r${icon} ${chalk.hex("#94A3B8")(this.text)}\n`);
	}
}
