import { createRequire } from "node:module";
import type * as TypeScript from "typescript";

// TypeScript is loaded on first parse. Importing the module costs ~200 ms,
// which the CLI shell must not pay for commands that never scan (--help,
// --version, create). The scanner is synchronous (it also runs inside worker
// threads), so the module is loaded synchronously via createRequire the
// first time analyzeSource runs — the worker pays the cost, not the shell.
const requireCjs = createRequire(import.meta.url);
let ts: typeof TypeScript;

function loadTypeScript(): void {
	ts ??= requireCjs("typescript") as typeof TypeScript;
}

// runtime the variable was read from
export type EnvSource = "process" | "vite" | "bun" | "deno";

export interface EnvAccess {
	readonly name: string;
	readonly line: number;
	readonly column: number;
	readonly source?: EnvSource;
}

export type EnvLoaderKind = "dotenv" | "node-load-env-file";

export interface EnvLoader {
	readonly kind: EnvLoaderKind;
	readonly line: number;
	readonly envFile?: string;
}

// exactly the process.env property-access expression
function isProcessEnv(node: TypeScript.Expression): boolean {
	return (
		ts.isPropertyAccessExpression(node) &&
		ts.isIdentifier(node.expression) &&
		node.expression.text === "process" &&
		node.name.text === "env"
	);
}

// 1-based line and column of the node start (single position lookup)
function positionOf(
	sourceFile: TypeScript.SourceFile,
	node: TypeScript.Node,
): { readonly line: number; readonly column: number } {
	const { line, character } = sourceFile.getLineAndCharacterOfPosition(
		// pass the sourceFile explicitly: without parent links (setParentNodes
		// is false) getStart() cannot resolve it from node.parent
		node.getStart(sourceFile),
	);
	return { line: line + 1, column: character + 1 };
}

function envObjectSource(node: TypeScript.Expression): EnvSource | undefined {
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
	callArguments: readonly TypeScript.Expression[],
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


// one pre-pass collecting both the dotenv binding names and the local names
// that shadow them; feeds the loader detection in analyzeSource
function collectLoaderContext(
	sourceFile: TypeScript.SourceFile,
	dotenvNames: Set<string>,
	localShadows: Set<string>,
): void {
	sourceFile.forEachChild(function visit(node: TypeScript.Node): void {
		if (
			ts.isImportDeclaration(node) &&
			ts.isStringLiteral(node.moduleSpecifier)
		) {
			const specifier = node.moduleSpecifier.text;
			const clause = node.importClause;
			// import dotenv from "dotenv"; / import * as dotenv from "dotenv";
			if (specifier === "dotenv") {
				if (clause?.name) {
					dotenvNames.add(clause.name.text);
				}
				if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
					dotenvNames.add(clause.namedBindings.name.text);
				}
			} else if (specifier !== "dotenv/config" && clause?.name) {
				// Local/relative imports shadow the npm package name,
				// e.g. `import dotenv from "./dotenv"`.
				localShadows.add(clause.name.text);
			}
		}

		if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
			// const dotenv = require("dotenv"); (any local name)
			const initializer = node.initializer;
			if (
				initializer !== undefined &&
				ts.isCallExpression(initializer) &&
				ts.isIdentifier(initializer.expression) &&
				initializer.expression.text === "require" &&
				initializer.arguments.length === 1
			) {
				const specifier = initializer.arguments[0];
				if (
					specifier !== undefined &&
					ts.isStringLiteral(specifier) &&
					specifier.text === "dotenv"
				) {
					dotenvNames.add(node.name.text);
				}
			}
			// a local `dotenv` binding shadows the npm package (unless it came
			// from require("dotenv") above)
			if (node.name.text === "dotenv") {
				localShadows.add("dotenv");
			}
		}

		// a function parameter named dotenv shadows the package
		if (
			(ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) &&
			node.parameters.some(
				(parameter) =>
					ts.isIdentifier(parameter.name) && parameter.name.text === "dotenv",
			)
		) {
			localShadows.add("dotenv");
		}

		node.forEachChild(visit);
	});
}

function isDotenvConfigCallee(
	callee: TypeScript.Expression,
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

// one TypeScript.SourceFile parse per analyzed file; parent links are never read,
// so building them (setParentNodes) is skipped
function parseSource(source: string): TypeScript.SourceFile {
	return ts.createSourceFile(
		"file.ts",
		source,
		ts.ScriptTarget.Latest,
		/* setParentNodes */ false,
		ts.ScriptKind.TS,
	);
}

export interface SourceAnalysis {
	readonly accesses: EnvAccess[];
	readonly loaders: EnvLoader[];
}

// parse the file once and collect both env accesses and loaders in a single
// AST walk; the scanner uses this so every file is parsed exactly once
export function analyzeSource(source: string): SourceAnalysis {
	loadTypeScript();
	const sourceFile = parseSource(source);

	const accesses: EnvAccess[] = [];
	const loaders: EnvLoader[] = [];
	const dotenvNames = new Set<string>();
	const localShadows = new Set<string>();
	collectLoaderContext(sourceFile, dotenvNames, localShadows);

	const visit = (node: TypeScript.Node): void => {
		// Dot notation on a known env object: `process.env.NAME`,
		// `import.meta.env.NAME`, `Bun.env.NAME`.
		if (ts.isPropertyAccessExpression(node)) {
			const source = envObjectSource(node.expression);
			if (source !== undefined) {
				const { line, column } = positionOf(sourceFile, node);
				accesses.push({ name: node.name.text, line, column, source });
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
				const { line, column } = positionOf(sourceFile, node);
				accesses.push({
					name: node.argumentExpression.text,
					line,
					column,
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
						const { line, column } = positionOf(sourceFile, element);
						accesses.push({ name, line, column, source });
					}
				}
			}
		}

		if (ts.isCallExpression(node)) {
			// Deno: `Deno.env.get("NAME")` (also `.get(key)` only with literals).
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
					const { line, column } = positionOf(sourceFile, node);
					accesses.push({ name: first.text, line, column, source: "deno" });
				}
			}

			const { expression: calleeExpr, arguments: callArguments } = node;

			// <dotenv>.config(...)
			if (isDotenvConfigCallee(calleeExpr, dotenvNames, localShadows)) {
				const { line } = positionOf(sourceFile, node);
				loaders.push({
					kind: "dotenv",
					line,
					envFile: configPathArgument(callArguments),
				});
			}

			// process.loadEnvFile(...) — Node.js native .env loading.
			if (
				ts.isPropertyAccessExpression(calleeExpr) &&
				ts.isIdentifier(calleeExpr.expression) &&
				calleeExpr.expression.text === "process" &&
				calleeExpr.name.text === "loadEnvFile"
			) {
				const first = callArguments[0];
				const { line } = positionOf(sourceFile, node);
				loaders.push({
					kind: "node-load-env-file",
					line,
					envFile:
						first !== undefined && ts.isStringLiteral(first)
							? first.text
							: undefined,
				});
			}
		}

		// Side-effect import: import "dotenv/config";
		if (
			ts.isImportDeclaration(node) &&
			node.importClause === undefined &&
			ts.isStringLiteral(node.moduleSpecifier) &&
			node.moduleSpecifier.text === "dotenv/config"
		) {
			loaders.push({ kind: "dotenv", line: positionOf(sourceFile, node).line });
		}

		node.forEachChild(visit);
	};

	sourceFile.forEachChild(visit);
	return { accesses, loaders };
}

// every statically-analyzable env loading call; purely structural (AST)
export function findEnvLoaders(source: string): EnvLoader[] {
	return analyzeSource(source).loaders;
}

// every statically-analyzable env variable access: process.env
// (dot/bracket/destructuring), import.meta.env, Bun.env, Deno.env.get("...")
export function findEnvAccesses(source: string): EnvAccess[] {
	return analyzeSource(source).accesses;
}