import { s } from "../style.ts";
import { banner, rule, ICONS } from "../ui.ts";
import type { EnvGraphCommand } from "./types.ts";

// Default `envgraph` command: quick health check.
export const envgraphCommand: EnvGraphCommand = {
	name: "envgraph",
	description: "Check that envgraph is installed and working.",
	usage: "envgraph",
	run(): number {
		const lines = [
			...banner("envgraph", "map environment variables to the files that use them"),
			`  ${s.success(ICONS.ok)} envgraph is ready. ${s.dim("Run `envgraph --help` to get started.")}`,
			rule(),
		];
		process.stdout.write(lines.join("\n") + "\n");
		return 0;
	},
};
