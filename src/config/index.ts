// public config API: defaults/types live in ./defaults.ts, discovery and
// loading in ./loader.ts — re-exported here so `envgraph` consumers (and the
// rest of the CLI) keep a single import path.
export * from "./defaults.ts";
export {
	getConfig,
	getConfigPath,
	hasConfigKey,
	setConfigUi,
	loadConfig,
	findConfigPath,
	findProjectRoot,
	isProjectRoot,
} from "./loader.ts";