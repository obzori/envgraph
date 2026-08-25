// one parsed line of a .env file, in file order:
// blank | comment (raw kept verbatim) | raw line without "=" | KEY=value
export type EnvLine =
	| { readonly kind: "blank" }
	| { readonly kind: "comment"; readonly raw: string }
	| { readonly kind: "raw"; readonly text: string }
	| {
			readonly kind: "assignment";
			readonly name: string;
			readonly value: string;
	  };

// parse .env contents preserving order so generated .env.example mirrors
// the source layout; split on first "=", quotes kept as part of the value
export function parseEnvFile(content: string): EnvLine[] {
	const lines = content.split(/\r?\n/);
	const result: EnvLine[] = [];

	for (let index = 0; index < lines.length; index++) {
		const raw = lines[index] ?? "";

		// A trailing newline produces a trailing empty string element; drop it
		// so generated files stay single-trailing-newline.
		if (raw === "" && index === lines.length - 1) {
			continue;
		}

		const trimmed = raw.trim();

		if (trimmed === "") {
			result.push({ kind: "blank" });
			continue;
		}

		if (trimmed.startsWith("#") || trimmed.startsWith(";")) {
			result.push({ kind: "comment", raw: raw.trimEnd() });
			continue;
		}

		const eqIndex = raw.indexOf("=");
		if (eqIndex === -1) {
			result.push({ kind: "raw", text: raw.trimEnd() });
			continue;
		}

		const name = raw.slice(0, eqIndex).trim();
		const value = raw.slice(eqIndex + 1).trim();
		result.push({ kind: "assignment", name, value });
	}

	return result;
}
