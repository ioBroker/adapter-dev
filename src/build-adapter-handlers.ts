/** Build script to use esbuild without specifying 1000 CLI options */
import { gray, green, red } from "ansi-colors";
import type {
	BuildOptions as ESBuildOptions,
	BuildResult,
	Format,
} from "esbuild";
import { build } from "esbuild";
import execa, { ExecaChildProcess } from "execa";
import path from "path";
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

function findTsc(): string {
	try {
		const packageJsonPath = require.resolve("typescript/package.json");
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const packageJson = require(packageJsonPath);
		const binPath = packageJson.bin.tsc;
		return path.join(path.dirname(packageJsonPath), binPath);
	} catch (e: any) {
		console.error(red(`Could not find tsc executable: ${e.message}`));
		process.exit(1);
	}
}

/** Helper function to determine file paths that serve as input for React builds */
async function getReactFilePaths(): Promise<{
	entryPoints: string[];
	tsConfigPath: string;
}> {
	let entryPoints = await glob(
		`${reactOptions.rootDir}/${reactOptions.pattern}`,
	);
	entryPoints = entryPoints.filter(
		(ep) =>
			!ep.endsWith(".d.ts") &&
			!ep.endsWith(".test.ts") &&
			!ep.endsWith(".test.tsx"),
	);

	const tsConfigPath = `${reactOptions.rootDir}/${reactOptions.tsConfig}`;
	return { entryPoints, tsConfigPath };
}

/** Helper function to determine file paths that serve as input for TypeScript builds */
async function getTypeScriptFilePaths(): Promise<{
	entryPoints: string[];
	tsConfigPath: string;
}> {
	let entryPoints = await glob(
		`${typescriptOptions.rootDir}/${typescriptOptions.pattern}`,
	);
	entryPoints = entryPoints.filter(
		(ep) => !ep.endsWith(".d.ts") && !ep.endsWith(".test.ts"),
	);
	const tsConfigPath = `${typescriptOptions.rootDir}/${typescriptOptions.tsConfig}`;
	return { entryPoints, tsConfigPath };
}

/** Type-checks the project with the given tsconfig path */
async function typeCheck(tsConfigPath: string): Promise<boolean> {
	console.log();
	console.log(gray(`Type-checking ${tsConfigPath} with tsc...`));
	const tscPath = findTsc();
	try {
		await execa.node(tscPath, `-p ${tsConfigPath} --noEmit`.split(" "), {
			stdout: "inherit",
			stderr: "inherit",
		});
		console.error(green(`✔ Type-checking ${tsConfigPath} succeeded!`));
		return true;
	} catch (e) {
		console.error(red(`❌ Type-checking ${tsConfigPath} failed!`));
		return false;
	}
}

function typeCheckWatch(tsConfigPath: string): ExecaChildProcess {
	console.log();
	console.log(
		gray(`Type-checking ${tsConfigPath} with tsc in watch mode...`),
	);
	const tscPath = findTsc();
	return execa.node(
		tscPath,
		`-p ${tsConfigPath} --noEmit --watch --preserveWatchOutput`.split(" "),
		{
			stdout: "inherit",
			stderr: "inherit",
		},
	);
}

function getReactBuildOptions(
	entryPoints: string[],
	tsConfigPath: string,
): ESBuildOptions {
	return {
		entryPoints,
		tsconfig: tsConfigPath,
		outdir: `${reactOptions.rootDir}/${reactOptions.outDir}`,
		bundle: reactOptions.bundle,
		format: reactOptions.format,
		target: reactOptions.compileTarget,
		minify: !watch,
		sourcemap: true,
		logLevel: "info",
		define: {
			"process.env.NODE_ENV": watch ? '"development"' : '"production"',
		},
	};
}

function getTypeScriptBuildOptions(
	entryPoints: string[],
	tsConfigPath: string,
): ESBuildOptions {
	return {
		entryPoints,
		tsconfig: tsConfigPath,
		outdir: `${typescriptOptions.rootDir}/${typescriptOptions.outDir}`,
		bundle: typescriptOptions.bundle,
		minify: false,
		sourcemap: true,
		logLevel: "info",
		platform: "node",
		format: typescriptOptions.format || "cjs",
		target: typescriptOptions.compileTarget,
	};
}

async function buildReact(): Promise<void> {
	const { entryPoints, tsConfigPath } = await getReactFilePaths();

	// Building React happens in one or two steps:
	// 1. fast compile with ESBuild
	console.log();
	console.log(gray("Compiling React with ESBuild..."));
	await build(getReactBuildOptions(entryPoints, tsConfigPath));

	// 2. type-check with TypeScript (if there are TSX entry points)
	if (entryPoints.some((e) => e.endsWith(".tsx"))) {
		if (!(await typeCheck(tsConfigPath))) {
			process.exit(1);
		}
	}
}

async function buildTypeScript(): Promise<void> {
	const { entryPoints, tsConfigPath } = await getTypeScriptFilePaths();

	// Building TS happens in two steps:
	// 1. fast compile with ESBuild
	console.log();
	console.log(gray("Compiling TypeScript with ESBuild..."));
	await build(getTypeScriptBuildOptions(entryPoints, tsConfigPath));

	// 2. type-check with TypeScript
	if (!(await typeCheck(tsConfigPath))) {
		process.exit(1);
	}
}

async function buildAll(): Promise<void> {
	await Promise.all([buildReact(), buildTypeScript()]);
}

async function watchReact(): Promise<{
	build: BuildResult;
	check?: ExecaChildProcess;
}> {
	const { entryPoints, tsConfigPath } = await getReactFilePaths();

	// Building React happens in one or two steps:
	// 1. fast compile with ESBuild
	console.log();
	console.log(gray("Compiling React with ESBuild in watch mode..."));
	const buildProcess = await build({
		...getReactBuildOptions(entryPoints, tsConfigPath),
		// We could run a separate type checking process after each successful
		// watch build, but keeping the process alive decreases the check time
		watch: true,
	});

	// 2. type-check with TypeScript (if there are TSX entry points)
	let checkProcess: ExecaChildProcess | undefined;
	if (entryPoints.some((e) => e.endsWith(".tsx"))) {
		checkProcess = typeCheckWatch(tsConfigPath);
	}
	return {
		build: buildProcess,
		check: checkProcess,
	};
}

async function watchTypeScript(): Promise<{
	build: BuildResult;
	check: ExecaChildProcess;
}> {
	const { entryPoints, tsConfigPath } = await getTypeScriptFilePaths();

	// Building TS happens in two steps:
	// 1. fast compile with ESBuild
	console.log();
	console.log(gray("Compiling TypeScript with ESBuild..."));
	const buildProcess = await build({
		...getTypeScriptBuildOptions(entryPoints, tsConfigPath),
		// We could run a separate type checking process after each successful
		// watch build, but keeping the process alive decreases the check time
		watch: true,
	});

	// 2. type-check with TypeScript
	const checkProcess = typeCheckWatch(tsConfigPath);
	return {
		build: buildProcess,
		check: checkProcess,
	};
}

// Entry points for the CLI
export async function handleBuildReactCommand(): Promise<void> {
	if (watch) {
		// In watch mode, we start the ESBuild and TSC processes in parallel
		// and wait until they end
		const { build, check } = await watchReact();
		return new Promise((resolve) => {
			check?.then(() => resolve()).catch(() => resolve());
			process.on("SIGINT", () => {
				console.log();
				console.log(gray("SIGINT received, shutting down..."));
				build.stop?.();
				if (check) {
					check.kill?.("SIGINT");
				} else {
					resolve();
				}
			});
		});
	} else {
		await buildReact();
	}
}

export async function handleBuildTypeScriptCommand(): Promise<void> {
	if (watch) {
		// In watch mode, we start the ESBuild and TSC processes in parallel
		// and wait until they end
		const { build, check } = await watchTypeScript();
		return new Promise((resolve) => {
			check.then(() => resolve()).catch(() => resolve());
			process.on("SIGINT", () => {
				console.log();
				console.log(gray("SIGINT received, shutting down..."));
				build.stop?.();
				check.kill?.("SIGINT");
			});
		});
	} else {
		await buildTypeScript();
	}
}

export async function handleBuildAllCommand(): Promise<void> {
	if (watch) {
		// In watch mode, we start the ESBuild and TSC processes in parallel
		// and wait until they end
		const { build: buildReact, check: checkReact } = await watchReact();
		const { build: buildTS, check: checkTS } = await watchTypeScript();
		return new Promise((resolve) => {
			Promise.all([checkReact, checkTS].filter(Boolean))
				.then(() => resolve())
				.catch(() => resolve());

			process.on("SIGINT", () => {
				console.log();
				console.log(gray("SIGINT received, shutting down..."));
				buildReact.stop?.();
				buildTS.stop?.();
				checkReact?.kill("SIGINT");
				checkTS.kill("SIGINT");
			});
		});
	} else {
		await buildAll();
	}
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
