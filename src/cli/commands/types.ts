/**
 * Contract every `envgraph` subcommand implements.
 *
 * The CLI dispatches based on {@link EnvGraphCommand.name}. Future analysis
 * commands (e.g. `envgraph analyze`) just need to be registered in
 * `./index.ts` to become available.
 */
export interface EnvGraphCommand {
	/** Command name used to invoke it, e.g. `analyze`. */
	readonly name: string;
	/** One-line description shown in help output. */
	readonly description: string;
	/** Example usage line shown in help output. */
	readonly usage: string;
	/**
	 * Execute the command. Receives the arguments after the command name.
	 * @returns a process exit code (0 on success); may be async.
	 */
	run(args: readonly string[]): number | Promise<number>;
}
