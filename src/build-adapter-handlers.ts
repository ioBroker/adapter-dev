/** Build script to use esbuild without specifying 1000 CLI options */
import { build } from "@alcalzone/estrella";
import type { Format } from "esbuild";
import glob from "tiny-glob";

interface BuildOptions {
	pattern: string;
	tsConfig: string;
	bundle: boolean;
	format?: Format;
	compileTarget: string;
	rootDir: string;
	outDir: string;
}

// Build options
let watch: boolean;
let reactOptions: BuildOptions;
let typescriptOptions: BuildOptions;

export async function buildReact(): Promise<void> {
	let entryPoints = await glob(
		`${reactOptions.rootDir}/${reactOptions.pattern}`,
	);
	entryPoints = entryPoints.filter(
		(ep) =>
			!ep.endsWith(".d.ts") &&
			!ep.endsWith(".test.ts") &&
			!ep.endsWith(".test.tsx"),
	);
	await build({
		entryPoints,
		tsconfig: `${reactOptions.rootDir}/${reactOptions.tsConfig}`, // default: tsconfig.json
		outdir: `${reactOptions.rootDir}/${reactOptions.outDir}`,
		bundle: reactOptions.bundle, // default: true
		format: reactOptions.format, // default: none/iife
		target: reactOptions.compileTarget, // default "es2018",
		minify: !watch,
		sourcemap: true,
		logLevel: "info",
		define: {
			"process.env.NODE_ENV": watch ? '"development"' : '"production"',
		},
	});
}

export async function buildTypeScript(): Promise<void> {
	let entryPoints = await glob(
		`${typescriptOptions.rootDir}/${typescriptOptions.pattern}`,
	);
	entryPoints = entryPoints.filter(
		(ep) => !ep.endsWith(".d.ts") && !ep.endsWith(".test.ts"),
	);
	await build({
		entryPoints,
		tsconfig: `${typescriptOptions.rootDir}/${typescriptOptions.tsConfig}`, // default: tsconfig.build.json
		outdir: `${reactOptions.rootDir}/${reactOptions.outDir}`,
		bundle: typescriptOptions.bundle, // default: false
		minify: false,
		sourcemap: true,
		logLevel: "info",
		platform: "node",
		format: typescriptOptions.format, // default: "cjs"
		target: typescriptOptions.compileTarget, // default: node12
	});
}

export async function buildAll(): Promise<void> {
	await Promise.all([buildReact(), buildTypeScript()]);
}

/******************************** Middlewares *********************************/

export async function parseOptions(options: {
	watch: boolean;
	reactPattern: string;
	reactTsConfig: string;
	reactBundle: boolean;
	reactFormat?: string;
	reactCompileTarget: string;
	reactRootDir: string;
	reactOutDir: string;
	typescriptPattern: string;
	typescriptTsConfig: string;
	typescriptBundle: boolean;
	typescriptFormat?: string;
	typescriptCompileTarget: string;
	typescriptRootDir: string;
	typescriptOutDir: string;
}): Promise<void> {
	watch = options.watch;
	reactOptions = {
		pattern: options.reactPattern,
		tsConfig: options.reactTsConfig,
		bundle: options.reactBundle,
		format: options.reactFormat as Format | undefined,
		compileTarget: options.reactCompileTarget,
		rootDir: options.reactRootDir,
		outDir: options.reactOutDir,
	};
	typescriptOptions = {
		pattern: options.typescriptPattern,
		tsConfig: options.typescriptTsConfig,
		bundle: options.typescriptBundle,
		format: options.typescriptFormat as Format | undefined,
		compileTarget: options.typescriptCompileTarget,
		rootDir: options.typescriptRootDir,
		outDir: options.typescriptOutDir,
	};
}
