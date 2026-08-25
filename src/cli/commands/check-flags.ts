export interface CheckFlags {
	readonly format?: "json";
	readonly output?: string;
}

export function parseCheckFlags(args: readonly string[]): {
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