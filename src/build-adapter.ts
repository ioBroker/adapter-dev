import {
	handleBuildAllCommand,
	handleBuildReactCommand,
	handleBuildTypeScriptCommand,
	parseOptions,
} from "./build-adapter-handlers";
import { interceptErrors } from "./util";
import yargs = require("yargs/yargs");

const parser = yargs(process.argv.slice(2));
parser
	.env("IOBROKER_BUILD")
	.strict()
	.usage("ioBroker adapter build script\n\nUsage: $0 <command> [options]")
	.alias("h", "help")
	.alias("v", "version")
	.command(
		["react"],
		"Compiles React sources",
		{},
		interceptErrors(handleBuildReactCommand),
	)
	.command(
		["typescript", "ts"],
		"Compile TypeScript sources",
		{},
		interceptErrors(handleBuildTypeScriptCommand),
	)
	.command(
		["all"],
		"Compile all of the above",
		{},
		interceptErrors(handleBuildAllCommand),
	)
	.options({
		watch: {
			type: "boolean",
			default: false,
			description: "Watch for changes and recompile",
		},
		reactRootDir: {
			type: "string",
			default: "admin",
			description:
				"Directory where the React part of the adapter is located",
		},
		reactOutDir: {
			type: "string",
			default: "build",
			description:
				"Directory where the compiled React output will be placed, relative to reactRootDir",
		},
		reactPattern: {
			type: "string",
			default: "src/{index,tab}.{tsx,jsx}",
			description:
				"Glob pattern for React source files, relative to reactRootDir. Each match will result in a separate bundle.",
		},
		reactTsConfig: {
			type: "string",
			default: "tsconfig.json",
			description:
				"Path to the React tsconfig.json file, relative to reactRootDir",
		},
		reactBundle: {
			type: "boolean",
			default: true,
			description:
				"Bundle compiled React output into one file per entry point.",
		},
		reactFormat: {
			choices: ["iife", "esm"],
			description:
				"Format of the output file(s). ESM should only be selected when targeting modern browsers exclusively.",
		},
		reactCompileTarget: {
			type: "string",
			default: "es2018",
			description:
				"Compilation target for React. Determines which JS features will be used in the output file.",
		},

		typescriptRootDir: {
			type: "string",
			default: ".",
			description:
				"Directory where the TypeScript part of the adapter is located",
		},
		typescriptOutDir: {
			type: "string",
			default: "build",
			description:
				"Directory where the compiled TypeScript output will be placed, relative to typescriptRootDir",
		},
		typescriptPattern: {
			type: "string",
			default: "src/**/*.ts",
			description:
				"Glob pattern for TypeScript source files, relative to typescriptRootDir. Should not be changed unless bundling is enabled. Each match will result in a separate bundle.",
		},
		typescriptTsConfig: {
			type: "string",
			default: "tsconfig.build.json",
			description:
				"Path to the tsconfig.json file used for building TypeScript, relative to typescriptRootDir",
		},
		typescriptBundle: {
			type: "boolean",
			default: false,
			description:
				"Bundle compiled TypeScript output into one file per entry point.",
		},
		typescriptFormat: {
			choices: ["cjs"],
			description:
				"Format of the output file(s). Only CommonJS (cjs) is supported at the moment.",
		},
		typescriptCompileTarget: {
			type: "string",
			default: "node12",
			description:
				"Compilation target for TypeScript. Determines which JS features will be used in the output file. Should be in sync with the minimum Node.js version supported by the adapter/ioBroker.",
		},
	})
	.middleware(parseOptions)
	.wrap(Math.min(100, parser.terminalWidth()))
	.help().argv;
