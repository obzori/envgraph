// static metadata every command exposes without loading its module; help
// output renders from this alone
export interface CommandMeta {
	readonly name: string;
	readonly description: string;
	readonly usage: string;
}

// contract every subcommand implements; dispatch by name
export interface EnvGraphCommand extends CommandMeta {
	// returns a process exit code (0 on success); may be async
	run(args: readonly string[]): number | Promise<number>;
}
