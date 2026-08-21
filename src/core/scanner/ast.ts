import ts from "typescript";

export interface EnvAccess {
	readonly name: string;
	readonly line: number;
}

/**
 * True when `node` is exactly the `process.env` property-access expression.
 */
function isProcessEnv(node: ts.Expression): boolean {
	return (
		ts.isPropertyAccessExpression(node) &&
		ts.isIdentifier(node.expression) &&
		node.expression.text === "process" &&
		node.name.text === "env"
	);
}

/**
 * Extract every statically-analyzable `process.env` access from source code.
 */
export function findEnvAccesses(source: string): EnvAccess[] {
	const sourceFile = ts.createSourceFile(
		"file.ts",
		source,
		ts.ScriptTarget.Latest,
		/* setParentNodes */ true,
		ts.ScriptKind.TS,
	);

	const accesses: EnvAccess[] = [];

	const visit = (node: ts.Node): void => {
		// Dot notation: `process.env.NAME`
		if (
			ts.isPropertyAccessExpression(node) &&
			isProcessEnv(node.expression)
		) {
			accesses.push({
				name: node.name.text,
				line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
			});
		}

		// Bracket notation: `process.env["NAME"]` / `process.env['NAME']`
		if (
			ts.isElementAccessExpression(node) &&
			isProcessEnv(node.expression) &&
			node.argumentExpression !== undefined &&
			ts.isStringLiteral(node.argumentExpression)
		) {
			accesses.push({
				name: node.argumentExpression.text,
				line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
			});
		}

		node.forEachChild(visit);
	};

	sourceFile.forEachChild(visit);
	return accesses;
}