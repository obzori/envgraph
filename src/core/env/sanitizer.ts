// substrings (case-insensitive, anywhere in the name) that mark a variable
// as sensitive -> blanked in .env.example. Deliberately no generic URL/KEY/ID;
// heuristic, not a guarantee.
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

export function isSensitiveName(name: string): boolean {
	const upper = name.toUpperCase();
	return SENSITIVE_PATTERNS.some((pattern) => upper.includes(pattern));
}

// value written in place of a sensitive variable's value in .env.example
export const SENSITIZED_VALUE = "";
