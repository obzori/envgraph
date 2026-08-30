import { test } from "node:test";
import assert from "node:assert/strict";
import { commands } from "../src/cli/commands/index.ts";

// The registry duplicates the static metadata so help output renders without
// loading any command module. This guards against the registry copies
// drifting apart from the loaded implementations.
test("registry metadata matches every loaded command implementation", async () => {
	for (const entry of commands) {
		const command = await entry.load();
		assert.equal(command.name, entry.name, `${entry.name}: name drift`);
		assert.equal(
			command.description,
			entry.description,
			`${entry.name}: description drift`,
		);
		assert.equal(command.usage, entry.usage, `${entry.name}: usage drift`);
	}
});
