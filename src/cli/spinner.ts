import chalk from "chalk";
import { s } from "./style.ts";

// simpleDotsScrolling spinner
const FRAMES: readonly string[] = [".  ", ".. ", "...", " ..", "  .", "   "];
const INTERVAL_MS = 200;
// minimal interval between progress-text repaints (throttles onFileDiscovered
// bursts, which can fire on every walked file during discovery)
const MIN_REPAINT_MS = 40;

// animated progress line; inert when stdout is not a TTY (CI, pipes)
export class Spinner {
	private timer: ReturnType<typeof setInterval> | undefined;
	private frame = 0;
	private readonly baseText: string;
	private text: string;
	private lastRepaint = 0;

	constructor(text: string) {
		this.baseText = text;
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

	// live-update the running line (e.g. "scanning ... (1,234 files)");
	// repaints are throttled so high-frequency progress callbacks stay cheap
	updateText(text: string): void {
		this.text = text;
		if (!process.stdout.isTTY || this.timer === undefined) {
			return;
		}
		const now = Date.now();
		if (now - this.lastRepaint < MIN_REPAINT_MS) {
			return;
		}
		this.lastRepaint = now;
		this.render();
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
		// reset to the base title so the final line is clean (no file count)
		this.text = this.baseText;
		const icon = ok ? s.success("✓") : s.error("✖");
		process.stdout.write(`\r${icon} ${chalk.hex("#94A3B8")(this.text)}\n`);
	}
}
