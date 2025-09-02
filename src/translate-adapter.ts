import {
	allLanguages,
	handleAllCommand,
	handleToJsonCommand,
	handleToWordsCommand,
	handleTranslateCommand,
	handleConvertCommand,
	parseOptions,
} from "./translate-adapter-handlers";
import { interceptErrors } from "./util";
import yargs from "yargs";

const parser = yargs(process.argv.slice(2));
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
parser
	.env("IOBROKER_TRANSLATE")
	.strict()
	.usage("ioBroker adapter translator\n\nUsage: $0 <command> [options]")
	.alias("h", "help")
	.alias("v", "version")
	.command(
		["translate", "t", "$0"],
		"Translate io-package.json and all admin language files",
		{
			rebuild: {
				type: "boolean",
				alias: "r",
				default: false,
				description: "Delete all existing translation files and rebuild everything",
			},
		},
		interceptErrors(handleTranslateCommand),
	)
	.command(
		["to-json", "adminWords2languages", "j"],
		"Convert words.js to i18n JSON files",
		{},
		interceptErrors(handleToJsonCommand),
	)
	.command(
		["to-words", "adminLanguages2words", "w"],
		"Generate words.js from i18n JSON files",
		{},
		interceptErrors(handleToWordsCommand),
	)
	.command(
		["all", "translateAndUpdateWordsJS", "a"],
		"Sequence of translate, to-words, to-json",
		{},
		interceptErrors(handleAllCommand),
	)
	.command(
		["convert", "c"],
		"Convert old file structure i18n/en/translations.json to new structure i18n/en.json",
		{},
		interceptErrors(handleConvertCommand),
	)
	/*
	translateAndUpdateWordsJS: TaskFunction;*/
	.options({
		"io-package": {
			type: "string",
			alias: "p",
			default: "./io-package.json",
			description: "Path to the io-package.json file",
		},
		admin: {
			type: "string",
			alias: "a",
			default: "./admin",
			description: "Path to the admin directory",
		},
		words: {
			type: "string",
			alias: "w",
			description: "Path to the words.js file",
		},
		base: {
			type: "string",
			alias: "b",
			array: true,
			description:
				"Path to the english i18n file, multiple files are possible",
		},
		languages: {
			type: "string",
			alias: "l",
			array: true,
			description: "Specify a subset of languages to be translated",
			choices: allLanguages,
		},
	})
	.middleware(parseOptions)
	.wrap(Math.min(100, parser.terminalWidth()))
	.help().argv;
