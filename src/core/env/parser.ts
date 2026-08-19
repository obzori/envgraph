/**
 * A single parsed line of a `.env` file, in file order.
 *
 * - `blank`: an empty or whitespace-only line.
 * - `comment`: a `#` (or `;`) comment line. `raw` is the verbatim line text
 *   (without the trailing newline), preserving any leading indentation.
 * - `assignment`: a `KEY=value` pair. `value` is the trimmed text after the
 *   first `=` (quotes are preserved as part of the value).
 * - `raw`: a non-empty line without `=` that is kept verbatim so unexpected
 *   content is never silently dropped.
 */
export type EnvLine =
	| { readonly kind: "blank" }
	| { readonly kind: "comment"; readonly raw: string }
	| { readonly kind: "raw"; readonly text: string }
	| {
			readonly kind: "assignment";
			readonly name: string;
			readonly value: string;
	  };

/**
 * Parse `.env` file contents into an ordered list of {@link EnvLine} entries.
 *
 * Supports `KEY=value` (split on the first `=`, so values may contain `=`), empty
 * values (`KEY=`), quoted values (quotes are kept as part of the value text),
 * `#`/`;` comment lines, and blank lines. Order is preserved so a generated
 * `.env.example` mirrors the source layout.
 */
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
