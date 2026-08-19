/**
 * Substrings (matched case-insensitively, anywhere in the variable name) that
 * mark a variable as potentially sensitive. Sensitive variables are blanked in
 * the generated `.env.example`.
 *
 * This list deliberately avoids generic substrings like `URL`, `KEY`, or `ID`
 * on their own — e.g. `API_URL` is intentionally NOT treated as sensitive even
 * though it contains `URL`. Only compound names that strongly imply a secret
 * (`API_KEY`, `DATABASE_URL`, …) are flagged.
 *
 * This is a heuristic, not a guarantee that every secret is detected.
 */
export const SENSITIVE_PATTERNS: readonly string[] = [
	"PASSWORD",
	"PASS",
	"SECRET",
	"TOKEN",
	"API_KEY",
	"APIKEY",
	"PRIVATE_KEY",
	"ACCESS_KEY",
	"CLIENT_SECRET",
	"AUTH_TOKEN",
	"DATABASE_URL",
	"DATABASE_URI",
];

/**
 * Heuristic check: a variable name is considered sensitive when it contains
 * (case-insensitively) one of the {@link SENSITIVE_PATTERNS}.
 */
export function isSensitiveName(name: string): boolean {
	const upper = name.toUpperCase();
	return SENSITIVE_PATTERNS.some((pattern) => upper.includes(pattern));
}

/**
 * The value written in place of a sensitive variable's value in
 * `.env.example`. Empty so the key remains as documentation of the variable,
 * but no credential is leaked.
 */
export const SENSITIZED_VALUE = "";
