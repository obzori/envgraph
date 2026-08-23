import ts from "typescript";

export interface EnvAccess {
	readonly name: string;
	readonly line: number;
}

/** Kinds of statically-recognized environment loading mechanisms. */
export type EnvLoaderKind = "dotenv" | "node-load-env-file";

/**
 * One detected environment-loading call site, e.g. `dotenv.config()` or
 * `process.loadEnvFile(".env")`. Never contains values read from any file.
 */
export interface EnvLoader {
	readonly kind: EnvLoaderKind;
	readonly line: number;
	/**
	 * Static `.env` path passed to the loader, when it was a plain string
	 * literal (e.g. `dotenv.config({ path: ".env.local" })`). Absent when the
	 * loader uses its default file or a dynamic path.
	 */
	readonly envFile?: string;
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

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
	return sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
}

/** Extract a static `path: "..."` string from a `dotenv.config({...})` argument. */
function configPathArgument(
	callArguments: readonly ts.Expression[],
): string | undefined {
	const first = callArguments[0];
	if (first === undefined || !ts.isObjectLiteralExpression(first)) {
		return undefined;
	}
	for (const property of first.properties) {
		if (
			ts.isPropertyAssignment(property) &&
			ts.isIdentifier(property.name) &&
			property.name.text === "path" &&
			ts.isStringLiteral(property.initializer)
		) {
			return property.initializer.text;
		}
	}
	return undefined;
}

/**
 * Collect the local identifiers statically bound to the npm `dotenv` package,
 * so later `<binding>.config()` calls can be attributed to it.
 *
 * Only bare package specifiers count: `"dotenv"` resolves to the npm package,
 * while `"./dotenv"` is a local module and never binds here.
 */
function collectDotenvBindingNames(
	sourceFile: ts.SourceFile,
	bindings: Set<string>,
): void {
	sourceFile.forEachChild(function visit(node: ts.Node): void {
		// import dotenv from "dotenv"; / import * as dotenv from "dotenv";
		if (
			ts.isImportDeclaration(node) &&
			ts.isStringLiteral(node.moduleSpecifier) &&
			node.moduleSpecifier.text === "dotenv"
		) {
			const clause = node.importClause;
			if (clause?.name) {
				bindings.add(clause.name.text);
			}
			if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
				bindings.add(clause.namedBindings.name.text);
			}
		}

		// const dotenv = require("dotenv");
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.initializer !== undefined &&
			ts.isCallExpression(node.initializer) &&
			ts.isIdentifier(node.initializer.expression) &&
			node.initializer.expression.text === "require" &&
			node.initializer.arguments.length === 1
		) {
			const specifier = node.initializer.arguments[0];
			if (
				specifier !== undefined &&
				ts.isStringLiteral(specifier) &&
				specifier.text === "dotenv"
			) {
				bindings.add(node.name.text);
			}
		}

		node.forEachChild(visit);
	});
}

/**
 * Collect locally-declared names that shadow the npm `dotenv` package
 * (variables, parameters). A bare `dotenv.config()` call is attributed to the
 * npm package unless such a local declaration exists in the same file.
 */
function collectLocalShadowNames(
	sourceFile: ts.SourceFile,
	shadows: Set<string>,
): void {
	sourceFile.forEachChild(function visit(node: ts.Node): void {
		// Local/relative imports shadow the npm package name,
		// e.g. `import dotenv from "./dotenv"`.
		if (
			ts.isImportDeclaration(node) &&
			node.importClause?.name &&
			ts.isStringLiteral(node.moduleSpecifier) &&
			node.moduleSpecifier.text !== "dotenv" &&
			node.moduleSpecifier.text !== "dotenv/config"
		) {
			shadows.add(node.importClause.name.text);
		}
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.name.text === "dotenv"
		) {
			shadows.add("dotenv");
		}
		if (
			(ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) &&
			node.parameters.some(
				(parameter) =>
					ts.isIdentifier(parameter.name) && parameter.name.text === "dotenv",
			)
		) {
			shadows.add("dotenv");
		}
		node.forEachChild(visit);
	});
}

/**
 * True when `callee` is `<dotenv>.config` where `<dotenv>` is either an
 * identifier bound to the npm dotenv package or a direct
 * `require("dotenv")` call.
 */
function isDotenvConfigCallee(
	callee: ts.Expression,
	dotenvNames: ReadonlySet<string>,
	localShadows: ReadonlySet<string>,
): boolean {
	if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== "config") {
		return false;
	}
	const target = callee.expression;
	if (ts.isIdentifier(target)) {
		if (dotenvNames.has(target.text)) {
			return true;
		}
		// Bare `dotenv.config()` — attributed to the npm package unless a
		// local declaration shadows the name in this file.
		return target.text === "dotenv" && !localShadows.has(target.text);
	}
	if (
		ts.isCallExpression(target) &&
		ts.isIdentifier(target.expression) &&
		target.expression.text === "require" &&
		target.arguments.length === 1
	) {
		const specifier = target.arguments[0];
		return (
			specifier !== undefined &&
			ts.isStringLiteral(specifier) &&
			specifier.text === "dotenv"
		);
	}
	return false;
}

/**
 * Extract every statically-analyzable environment loading call from source
 * code. Detection is purely structural (AST-based): string literals like
 * `"dotenv.config()"` and comments never match.
 */
export function findEnvLoaders(source: string): EnvLoader[] {
	const sourceFile = ts.createSourceFile(
		"file.ts",
		source,
		ts.ScriptTarget.Latest,
		/* setParentNodes */ true,
		ts.ScriptKind.TS,
	);

	const dotenvNames = new Set<string>();
	collectDotenvBindingNames(sourceFile, dotenvNames);
	const localShadows = new Set<string>();
	collectLocalShadowNames(sourceFile, localShadows);

	const loaders: EnvLoader[] = [];

	const visit = (node: ts.Node): void => {
		// Side-effect import: import "dotenv/config";
		if (
			ts.isImportDeclaration(node) &&
			node.importClause === undefined &&
			ts.isStringLiteral(node.moduleSpecifier) &&
			node.moduleSpecifier.text === "dotenv/config"
		) {
			loaders.push({ kind: "dotenv", line: lineOf(sourceFile, node) });
		}

		if (ts.isCallExpression(node)) {
			const { expression: callee, arguments: callArguments } = node;

			// <dotenv>.config(...)
			if (isDotenvConfigCallee(callee, dotenvNames, localShadows)) {
				loaders.push({
					kind: "dotenv",
					line: lineOf(sourceFile, node),
					envFile: configPathArgument(callArguments),
				});
			}

			// process.loadEnvFile(...) — Node.js native .env loading.
			if (
				ts.isPropertyAccessExpression(callee) &&
				ts.isIdentifier(callee.expression) &&
				callee.expression.text === "process" &&
				callee.name.text === "loadEnvFile"
			) {
				const first = callArguments[0];
				loaders.push({
					kind: "node-load-env-file",
					line: lineOf(sourceFile, node),
					envFile:
						first !== undefined && ts.isStringLiteral(first)
							? first.text
							: undefined,
				});
			}
		}

		node.forEachChild(visit);
	};

	sourceFile.forEachChild(visit);
	return loaders;
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