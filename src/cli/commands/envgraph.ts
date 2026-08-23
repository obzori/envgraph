import { s } from "../style.ts";
import type { EnvGraphCommand } from "./types.ts";

/**
 * Default `envgraph` command.
 *
 * Placeholder only — future work will wire this to `core.runEnvGraph()`.
 */
export const envgraphCommand: EnvGraphCommand = {
	name: "envgraph",
	description: "Check that envgraph is installed and working.",
	usage: "envgraph",
	run(): number {
		process.stdout.write(
			`${s.success("✓")} ${s.brand("envgraph")} is ready. ${s.dim("Run `envgraph --help` to get started.")}\n`,
		);
		return 0;
	},
};
