import ts from "typescript";

// runtime the variable was read from
export type EnvSource = "process" | "vite" | "bun" | "deno";

export interface EnvAccess {
	readonly name: string;
	readonly line: number;
	readonly source?: EnvSource;
}

export type EnvLoaderKind = "dotenv" | "node-load-env-file";

export interface EnvLoader {
	readonly kind: EnvLoaderKind;
	readonly line: number;
	readonly envFile?: string;
}

// exactly the process.env property-access expression
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

function envObjectSource(node: ts.Expression): EnvSource | undefined {
	if (isProcessEnv(node)) {
		return "process";
	}
	// import.meta.env
	if (
		ts.isPropertyAccessExpression(node) &&
		ts.isMetaProperty(node.expression) &&
		node.name.text === "env"
	) {
		return "vite";
	}
	// Bun.env
	if (
		ts.isPropertyAccessExpression(node) &&
		ts.isIdentifier(node.expression) &&
		node.expression.text === "Bun" &&
		node.name.text === "env"
	) {
		return "bun";
	}
	return undefined;
}

// static path: "..." from a dotenv.config({...}) argument
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

// every statically-analyzable env loading call; purely structural (AST)
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

// every statically-analyzable env variable access: process.env
// (dot/bracket/destructuring), import.meta.env, Bun.env, Deno.env.get("...")
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
		// Dot notation on a known env object: `process.env.NAME`,
		// `import.meta.env.NAME`, `Bun.env.NAME`.
		if (ts.isPropertyAccessExpression(node)) {
			const source = envObjectSource(node.expression);
			if (source !== undefined) {
				accesses.push({
					name: node.name.text,
					line: lineOf(sourceFile, node),
					source,
				});
			}
		}

		// Bracket notation with a static string: `process.env["NAME"]`,
		// `import.meta.env['NAME']`, `Bun.env["NAME"]`.
		if (
			ts.isElementAccessExpression(node) &&
			node.argumentExpression !== undefined &&
			ts.isStringLiteral(node.argumentExpression)
		) {
			const source =
				node.expression !== undefined
					? envObjectSource(node.expression)
					: undefined;
			if (source !== undefined) {
				accesses.push({
					name: node.argumentExpression.text,
					line: lineOf(sourceFile, node),
					source,
				});
			}
		}

		// Destructuring: `const { A, B: local = "x", ...rest } = process.env;`
		// (also works with `import.meta.env` and `Bun.env`). Rest elements and
		// computed/dynamic keys are skipped.
		if (
			ts.isVariableDeclaration(node) &&
			ts.isObjectBindingPattern(node.name) &&
			node.initializer !== undefined
		) {
			const source = envObjectSource(node.initializer);
			if (source !== undefined) {
				for (const element of node.name.elements) {
					if (!ts.isBindingElement(element) || element.dotDotDotToken) {
						continue;
					}
					// Env var name: explicit property name wins (`{ PORT: port }`),
					// otherwise the bound identifier itself. Only identifiers are
					// statically resolvable — computed names (`{ [key]: v }`) and
					// rest elements are ignored.
					let name: string | undefined;
					if (element.propertyName) {
						if (ts.isIdentifier(element.propertyName)) {
							name = element.propertyName.text;
						}
					} else if (ts.isIdentifier(element.name)) {
						name = element.name.text;
					}
					if (name !== undefined) {
						accesses.push({
							name,
							line: lineOf(sourceFile, element),
							source,
						});
					}
				}
			}
		}

		// Deno: `Deno.env.get("NAME")` (also `.get(key)` only with literals).
		if (ts.isCallExpression(node)) {
			const callee = node.expression;
			if (
				ts.isPropertyAccessExpression(callee) &&
				callee.name.text === "get" &&
				ts.isPropertyAccessExpression(callee.expression) &&
				ts.isIdentifier(callee.expression.expression) &&
				callee.expression.expression.text === "Deno" &&
				callee.expression.name.text === "env"
			) {
				const first = node.arguments[0];
				if (first !== undefined && ts.isStringLiteral(first)) {
					accesses.push({
						name: first.text,
						line: lineOf(sourceFile, node),
						source: "deno",
					});
				}
			}
		}

		node.forEachChild(visit);
	};

	sourceFile.forEachChild(visit);
	return accesses;
}