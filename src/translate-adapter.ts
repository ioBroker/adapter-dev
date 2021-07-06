import { gray, red, yellow } from "ansi-colors";
import {
	ensureDir,
	existsSync,
	readFile,
	readJson,
	stat,
	writeFile,
	writeJson,
} from "fs-extra";
import { EOL } from "os";
import glob from "tiny-glob";
import { translateText } from "./translate";
import { escapeRegExp, padRight } from "./util";
import path = require("path");
import yargs = require("yargs/yargs");

let ioPackage: string;
let admin: string;
let words: string;
let i18nBases: string[];

const parser = yargs(process.argv.slice(2));
parser
	.env("IOBROKER_TRANSLATE")
	.strict()
	.usage("ioBroker adapter translator\n\nUsage: $0 <command> [options]")
	.alias("h", "help")
	.alias("v", "version")
	.command(
		["translate", "t"],
		"Translate io-package.json and all admin language files",
		{},
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
	/*
	translateAndUpdateWordsJS: TaskFunction;*/
	.options({
		ioPackage: {
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
	})
	.middleware(setDirectories)
	.wrap(Math.min(100, parser.terminalWidth()))
	.help().argv;

/********************************** Helpers ***********************************/

const _languages = {
	en: {},
	de: {},
	ru: {},
	pt: {},
	nl: {},
	fr: {},
	it: {},
	es: {},
	pl: {},
	"zh-cn": {},
};

type Language = keyof typeof _languages;

function getLanguages(): Language[] {
	return Object.keys(_languages) as Language[];
}

function createEmptyLangObject<T>(createDefault: () => T): Record<Language, T> {
	return getLanguages().reduce(
		(obj, curr) => ({ ...obj, [curr]: createDefault() }),
		{} as Record<Language, T>,
	);
}

/**
 * Creates a regexp pattern for an english base file name.
 * It matches file names and allows to find/replace the language code
 */
function createFilePattern(baseFile: string): RegExp {
	if (!baseFile.match(/\Wen\W/)) {
		throw new Error("Base file must be an English JSON file");
	}
	return new RegExp(
		`^(${escapeRegExp(baseFile).replace(
			/(?<=\W)en(?=\W)/,
			")([a-z-]+)(",
		)})$`,
		"i",
	);
}

async function findAllLanguageFiles(baseFile: string): Promise<string[]> {
	const filePattern = createFilePattern(baseFile);
	const allJsonFiles = await glob(
		path.join(admin, "**", "*.json").replace(/\\/g, "/"),
		{
			absolute: true,
		},
	);
	const languages = getLanguages();
	return allJsonFiles.filter((file) => {
		const match = file.match(filePattern);
		if (!match) {
			return false;
		}
		const lang = match[2] as Language;
		return languages.includes(lang);
	});
}

function die(message: string): never {
	console.error(red(message));
	process.exit(1);
}

function interceptErrors(func: () => Promise<void>): () => Promise<void> {
	return async () => {
		try {
			await func();
		} catch (error) {
			die(error.stack || error);
		}
	};
}

/******************************** Middlewares *********************************/

async function setDirectories(options: {
	ioPackage: string;
	admin: string;
	words?: string;
	base?: string[];
}): Promise<void> {
	// io-package.json
	ioPackage = path.resolve(options.ioPackage);
	if (!existsSync(ioPackage) || !(await stat(ioPackage)).isFile()) {
		return die(`Couldn't find file ${ioPackage}`);
	}

	// admin directory
	admin = path.resolve(options.admin);
	if (!existsSync(admin) || !(await stat(admin)).isDirectory()) {
		return die(`Couldn't find directory ${admin}`);
	}

	// words.js
	if (options.words) {
		words = path.resolve(options.words);
	} else if (existsSync(path.join(admin, "js", "words.js"))) {
		words = path.join(admin, "js", "words.js");
	} else {
		words = path.join(admin, "words.js");
	}

	// i18n base file
	if (options.base) {
		i18nBases = options.base.map((p) => path.resolve(p));
	} else {
		const defaultPath = path.join(admin, "i18n", "en", "translations.json");
		i18nBases = [
			defaultPath,
			path.join(admin, "src", "i18n", "en.json"),
		].filter(existsSync);
		if (i18nBases.length === 0) {
			// if no path exists, we are most likely using words.js and
			// expect the i18n file to be in the default path
			i18nBases = [defaultPath];
		}
	}
}

/***************************** Command Handlers *******************************/

async function handleTranslateCommand(): Promise<void> {
	await translateIoPackage();
	for (const i18nBase of i18nBases) {
		await translateI18n(i18nBase);
	}
}

async function handleToJsonCommand(): Promise<void> {
	if (!existsSync(words)) {
		return die(`Couldn't find words file ${words}`);
	}

	await adminWords2languages(words, i18nBases[0]);
}

async function handleToWordsCommand(): Promise<void> {
	await adminLanguages2words(i18nBases[0]);
}

async function handleAllCommand(): Promise<void> {
	await handleTranslateCommand();
	await handleToWordsCommand();
	await handleToJsonCommand();
}

/****************************** Implementation ********************************/

async function translateIoPackage(): Promise<void> {
	const content = await readJson(ioPackage);
	if (content.common.news) {
		console.log("Translate News");
		for (const k in content.common.news) {
			console.log(`News: ${k}`);
			const nw = content.common.news[k];
			await translateNotExisting(nw);
		}
	}
	if (content.common.titleLang) {
		console.log("Translate Title");
		await translateNotExisting(
			content.common.titleLang,
			content.common.title,
		);
	}
	if (content.common.desc) {
		console.log("Translate Description");
		await translateNotExisting(content.common.desc);
	}
	await writeJson(ioPackage, content, { spaces: 4, EOL });
	console.log(`Successfully updated ${path.relative(".", ioPackage)}`);
}

async function translateNotExisting(
	obj: Partial<Record<Language, string>>,
	baseText?: string,
): Promise<void> {
	let text = obj.en;
	if (!text) {
		text = baseText;
	}

	if (text) {
		for (const lang of getLanguages()) {
			if (!obj[lang]) {
				const time = new Date().getTime();
				obj[lang] = await translateText(text, lang);
				console.log(
					gray(`en -> ${lang} ${new Date().getTime() - time} ms`),
				);
			}
		}
	}
}

async function translateI18n(baseFile: string): Promise<void> {
	const filePattern = createFilePattern(baseFile);
	const baseContent = await readJson(baseFile);
	const missingLanguages = getLanguages();
	const files = await findAllLanguageFiles(baseFile);
	for (const file of files) {
		const match = file.match(filePattern);
		const lang = match![2] as Language; // language files always match
		const langIndex = missingLanguages.indexOf(lang);
		missingLanguages.splice(langIndex, 1);
		if (lang === "en") continue;
		const translation = await readJson(file);
		await translateI18nJson(translation, lang, baseContent);
		await writeJson(file, translation, { spaces: 4, EOL });
		console.log(`Successfully updated ${path.relative(".", file)}`);
	}
	for (const lang of missingLanguages) {
		const translation: Record<string, string> = {};
		await translateI18nJson(translation, lang, baseContent);
		const filename = baseFile.replace(filePattern, `$1${lang}$3`);
		await ensureDir(path.dirname(filename));
		await writeJson(filename, translation, {
			spaces: 4,
			EOL,
		});
		console.log(`Successfully created ${path.relative(".", filename)}`);
	}
}

async function translateI18nJson(
	content: Record<string, string>,
	lang: Language,
	baseContent: Readonly<Record<string, string>>,
): Promise<void> {
	if (lang === "en") {
		return;
	}
	const time = new Date().getTime();
	for (const t in baseContent) {
		if (!content[t]) {
			content[t] = await translateText(baseContent[t], lang);
		}
	}
	console.log(
		gray(`Translate Admin en -> ${lang} ${new Date().getTime() - time} ms`),
	);
}

async function adminWords2languages(
	words: string,
	i18nBase: string,
): Promise<void> {
	const filePattern = createFilePattern(i18nBase);
	const data = parseWordJs(await readFile(words, "utf-8"));
	const langs = createEmptyLangObject(() => ({} as Record<string, string>));
	for (const word in data) {
		if (!data.hasOwnProperty(word)) continue;
		for (const lang in data[word]) {
			if (!data[word].hasOwnProperty(lang)) continue;
			const language = lang as Language;
			langs[language][word] = data[word][language];
			//  pre-fill all other languages
			for (const j of getLanguages()) {
				if (langs.hasOwnProperty(j)) {
					langs[j][word] = langs[j][word] || "";
				}
			}
		}
	}
	for (const lang in langs) {
		if (!langs.hasOwnProperty(lang)) continue;
		const language = lang as Language;
		const keys = Object.keys(langs[language]);
		keys.sort();
		const obj: Record<string, string> = {};
		for (let k = 0; k < keys.length; k++) {
			obj[keys[k]] = langs[language][keys[k]];
		}
		const filename = i18nBase.replace(filePattern, `$1${lang}$3`);
		await ensureDir(path.dirname(filename));
		await writeJson(filename, obj, {
			spaces: 4,
			EOL,
		});
		console.log(`Successfully updated ${path.relative(".", filename)}`);
	}
}

function parseWordJs(words: string): Record<string, Record<Language, string>> {
	words = words.substring(words.indexOf("{"), words.length);
	words = words.substring(0, words.lastIndexOf(";"));

	const resultFunc = new Function("return " + words + ";");

	return resultFunc();
}

async function adminLanguages2words(i18nBase: string): Promise<void> {
	const filePattern = createFilePattern(i18nBase);
	const newWords: Record<string, Record<Language, string>> = {};
	const files = await findAllLanguageFiles(i18nBase);
	for (const file of files) {
		const match = file.match(filePattern);
		const lang = match![2] as Language; // language files always match
		const translations = await readJson(file);
		for (const key in translations) {
			if (translations.hasOwnProperty(key)) {
				newWords[key] =
					newWords[key] || createEmptyLangObject(() => "");
				newWords[key][lang] = translations[key];
			}
		}
	}

	try {
		// merge existing and new words together (and check for missing translations)
		const existingWords = parseWordJs(await readFile(words, "utf-8"));
		for (const key in existingWords) {
			if (existingWords.hasOwnProperty(key)) {
				const translations = existingWords[key];
				if (!newWords[key]) {
					console.warn(yellow(`Take from current words.js: ${key}`));
					newWords[key] = translations;
				}
				getLanguages()
					.filter((lang) => !newWords[key][lang])
					.forEach((lang) =>
						console.warn(yellow(`Missing "${lang}": ${key}`)),
					);
			}
		}
	} catch (error) {
		// ignore error, we just use the strings from the translation files
		//console.log(error);
	}

	await writeFile(words, createWordsJs(newWords));
	console.log(`Successfully updated ${path.relative(".", words)}`);
}

function createWordsJs(data: Record<string, Record<Language, string>>): string {
	const lines: string[] = [];
	lines.push("/*global systemDictionary:true */");
	lines.push("/*");
	lines.push("+================= DO NOT MODIFY =================+");
	lines.push("|   This file was generated by gulp, please use   |");
	lines.push("|    `gulp adminLanguages2words` to update it.    |");
	lines.push("+================= DO NOT MODIFY =================+");
	lines.push("*/");
	lines.push("'use strict';\n");
	lines.push("systemDictionary = {");
	for (const word in data) {
		if (!data.hasOwnProperty(word)) continue;
		let line = "";
		for (const lang in data[word]) {
			if (!data[word].hasOwnProperty(lang)) continue;
			const item = data[word][lang as Language];
			const text = padRight(item.replace(/"/g, '\\"') + '",', 50);
			line += `"${lang}": "${text} `;
		}
		if (line) {
			line = line.trim();
			line = line.substring(0, line.length - 1);
		}
		const preamble = padRight(`"${word.replace(/"/g, '\\"')}": {`, 50);
		lines.push(`    ${preamble}${line}},`);
	}
	lines.push("};");
	return lines.join(EOL).trimEnd();
}