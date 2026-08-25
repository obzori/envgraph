import type { OutputFormat } from "../output/index.ts";

// output decoration level for the CLI
export type UiTheme = "pretty" | "minimal";

export interface ExampleConfig {
	readonly keepComments: boolean;
	readonly defaults: Readonly<Record<string, string>>;
}

export interface EnvGraphConfig {
	readonly include: readonly string[];
	readonly exclude: readonly string[];
	readonly outputFormat: OutputFormat;
	// "pretty" draws rules and banners; "minimal" omits the rules
	readonly ui: UiTheme;
	readonly example: ExampleConfig;
}

export interface EnvGraphUserConfig {
	readonly include?: readonly string[];
	readonly exclude?: readonly string[];
	readonly outputFormat?: OutputFormat;
	readonly ui?: UiTheme;
	readonly example?: {
		readonly keepComments?: boolean;
		readonly defaults?: Record<string, string>;
	};
}

export const DEFAULT_EXAMPLE_CONFIG: ExampleConfig = {
	keepComments: true,
	defaults: {},
};

export const DEFAULT_CONFIG: EnvGraphConfig = {
	include: ["**/*.{js,ts,jsx,tsx}"],
	exclude: ["**/node_modules/**", "**/dist/**", "**/build/**"],
	outputFormat: "classic",
	ui: "pretty",
	example: DEFAULT_EXAMPLE_CONFIG,
};

// keys recognized when merging a user config over the defaults
export function mergeConfig(
	defaults: EnvGraphConfig,
	user: EnvGraphUserConfig,
): EnvGraphConfig {
	return {
		include: user.include ?? defaults.include,
		exclude: user.exclude ?? defaults.exclude,
		outputFormat: user.outputFormat ?? defaults.outputFormat,
		ui: user.ui ?? defaults.ui,
		example: {
			keepComments: user.example?.keepComments ?? defaults.example.keepComments,
			defaults: user.example?.defaults ?? defaults.example.defaults,
		},
	};
}

// top-level keys explicitly set in a user config object
export function explicitKeys(user: EnvGraphUserConfig): ReadonlySet<string> {
	return new Set(
		Object.keys(user).filter(
			(k) => (user as Record<string, unknown>)[k] !== undefined,
		),
	);
}
