// contract every subcommand implements; dispatch by name
export interface EnvGraphCommand {
	readonly name: string;
	readonly description: string;
	readonly usage: string;
	// returns a process exit code (0 on success); may be async
	run(args: readonly string[]): number | Promise<number>;
}
