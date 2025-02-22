import { gray, yellow } from "ansi-colors";
import {
	ensureDir,
	existsSync,
	readFile,
	readJson,
	stat,
	writeFile,
	writeJson,
	readdirSync,
	unlinkSync,
	rmdirSync,
} from "fs-extra";
import path from "node:path";
import glob from "tiny-glob";
import { translateText } from "./translate";
import { die, escapeRegExp, getIndentation, padRight } from "./util";

let ioPackage: string;
let admin: string;
let words: string;
let i18nBases: string[];
let translateLanguages: ioBroker.Languages[];
const EOL = "\n"; // Use only LINUX line endings

/********************************** Helpers ***********************************/

const _languages: Record<ioBroker.Languages, any> = {
	en: {},
	de: {},
	ru: {},
	pt: {},
	nl: {},
	fr: {},
	it: {},
	es: {},
	pl: {},
	uk: {},
	"zh-cn": {},
};
export const allLanguages = Object.keys(_languages) as ioBroker.Languages[];

function createEmptyLangObject<T>(
	createDefault: () => T,
): Record<ioBroker.Languages, T> {
	return translateLanguages.reduce(
		(obj, curr) => ({ ...obj, [curr]: createDefault() }),
		{} as Record<ioBroker.Languages, T>,
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
		{ absolute: true },
	);

	return allJsonFiles.filter((file) => {
		const match = file.match(filePattern);
		if (!match) {
			return false;
		}
		const lang = match[2] as ioBroker.Languages;
		return translateLanguages.includes(lang);
	});
}

/** Convert the "LANG/translation.json" files to "LANG.json" files */
async function convertTranslationJson2LanguageJson(
	basePath: string,
): Promise<void> {
	const dirs = readdirSync(basePath, { withFileTypes: true })
		.filter((dirent) => dirent.isDirectory())
		.map((dirent) => dirent.name);

	for (const dir of dirs) {
		const langPath = path.join(basePath, dir, "translations.json");
		const text: Record<string, string> = await readJson(langPath);
		// Write the new file
		await writeJson(path.join(basePath, `${dir}.json`), text, {
			spaces: 4,
			EOL,
		});
		unlinkSync(langPath);
		rmdirSync(path.join(basePath, dir));
	}

	// Try to sort the files
	const files = readdirSync(basePath).filter((file) =>
		file.endsWith(".json"),
	);

	// Read a file, sort the keys and write it back
	for (const file of files) {
		const filePath = path.join(basePath, file);
		const text: Record<string, string> = await readJson(filePath);
		// Sort the keys
		const sortedText: Record<string, string> = {};
		Object.keys(text)
			.sort()
			.forEach((key) => {
				sortedText[key] = text[key];
			});
		// Write the new file
		await writeJson(filePath, sortedText, {
			spaces: 4,
			EOL,
		});
	}
}

/******************************** Middlewares *********************************/

export async function handleConvertCommand(): Promise<void> {
	await convertTranslationJson2LanguageJson(path.join(admin, "i18n"));
}

export async function parseOptions(options: {
	"io-package": string;
	admin: string;
	words?: string;
	base?: string[];
	languages?: string[];
}): Promise<void> {
	// io-package.json
	ioPackage = path.resolve(options["io-package"]);
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
		const defaultPath = path.join(admin, "i18n", "en.json");
		i18nBases = [
			defaultPath,
			path.join(admin, "i18n", "en", "translations.json"),
			path.join(admin, "src", "i18n", "en.json"),
			path.join(admin, "..", "src", "src", "i18n", "en.json"),
			path.join(admin, "..", "src-admin", "src", "i18n", "en.json"),
		].filter(existsSync);
		if (i18nBases.length === 0) {
			// if no path exists, we are most likely using words.js and
			// expect the i18n file to be in the default path
			i18nBases = [defaultPath];
		}
	}

	if (options.languages?.length) {
		// Check if an unknown language was specified
		const unknownLanguages = options.languages.filter(
			(l) => !allLanguages.includes(l as any),
		);
		if (unknownLanguages.length > 0) {
			return die(`Unknown language(s): ${unknownLanguages.join(", ")}`);
		}
		translateLanguages = options.languages as ioBroker.Languages[];
	} else {
		translateLanguages = allLanguages;
	}
}

/***************************** Command Handlers *******************************/

export async function handleTranslateCommand(): Promise<void> {
	await translateIoPackage();
	for (const i18nBase of i18nBases) {
		await translateI18n(i18nBase);
	}
}

export function handleToJsonCommand(): Promise<void> {
	if (!existsSync(words)) {
		return die(`Couldn't find words file ${words}`);
	}

	return adminWords2languages(words, i18nBases[0]);
}

export function handleToWordsCommand(): Promise<void> {
	return adminLanguages2words(i18nBases[0]);
}

export async function handleAllCommand(): Promise<void> {
	await handleTranslateCommand();
	// execute it only if words.js exists, but now we do not need it
	if (existsSync(words)) {
		await handleToWordsCommand();
		await handleToJsonCommand();
	}
}

/****************************** Implementation ********************************/

async function translateIoPackage(): Promise<void> {
	const ioPackageFile = await readFile(ioPackage, "utf-8");
	const indentation = getIndentation(ioPackageFile);
	const content = JSON.parse(ioPackageFile);

	if (content.common.news) {
		console.log("Translate News");
		for (const [k, nw] of Object.entries(content.common.news)) {
			console.log(`News: ${k}`);
			await translateNotExisting(nw as any);
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
	// https://github.com/ioBroker/adapter-dev/issues/138
	if (content.common.messages) {
		console.log("Translate Messages");
		for (const message of content.common.messages) {
			console.log(`   Message: ${message.title.en}`);
			await translateNotExisting(message.title);
			await translateNotExisting(message.text);
			if (message.linkText) {
				await translateNotExisting(message.linkText);
			}
		}
	}
	await writeJson(ioPackage, content, { spaces: indentation, EOL });
	console.log(`Successfully updated ${path.relative(".", ioPackage)}`);
}

async function translateNotExisting(
	obj: Partial<Record<ioBroker.Languages, string>>,
	baseText?: string,
): Promise<void> {
	const text = obj.en || baseText;

	if (text) {
		for (const lang of translateLanguages) {
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
	const missingLanguages = new Set<ioBroker.Languages>(translateLanguages);
	const files = await findAllLanguageFiles(baseFile);
	for (const file of files) {
		const match = file.match(filePattern);
		if (!match) continue;
		const lang = match[2] as ioBroker.Languages;
		missingLanguages.delete(lang);
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
		await writeJson(filename, translation, { spaces: 4, EOL });
		console.log(`Successfully created ${path.relative(".", filename)}`);
	}
}

async function translateI18nJson(
	content: Record<string, string>,
	lang: ioBroker.Languages,
	baseContent: Readonly<Record<string, string>>,
): Promise<void> {
	if (lang === "en") {
		return;
	}
	const time = new Date().getTime();
	for (const [t, base] of Object.entries(baseContent)) {
		if (!content[t]) {
			content[t] = await translateText(base, lang);
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
	const langs = createEmptyLangObject(() => ({}) as Record<string, string>);
	for (const [word, translations] of Object.entries(data)) {
		for (const [lang, translation] of Object.entries(translations)) {
			const language = lang as ioBroker.Languages;
			langs[language][word] = translation;
			//  pre-fill all other languages
			for (const j of translateLanguages) {
				if (langs.hasOwnProperty(j)) {
					langs[j][word] = langs[j][word] || "";
				}
			}
		}
	}
	for (const [lang, translations] of Object.entries(langs)) {
		const language = lang as ioBroker.Languages;
		const keys = Object.keys(translations);
		keys.sort();
		const obj: Record<string, string> = {};
		for (const key of keys) {
			obj[key] = langs[language][key];
		}
		const filename = i18nBase.replace(filePattern, `$1${lang}$3`);
		await ensureDir(path.dirname(filename));
		await writeJson(filename, obj, { spaces: 4, EOL });
		console.log(`Successfully updated ${path.relative(".", filename)}`);
	}
}

function parseWordJs(
	words: string,
): Record<string, Record<ioBroker.Languages, string>> {
	words = words.substring(words.indexOf("{"), words.length);
	words = words.substring(0, words.lastIndexOf(";"));

	const resultFunc = new Function("return " + words + ";");

	return resultFunc();
}

async function adminLanguages2words(i18nBase: string): Promise<void> {
	const filePattern = createFilePattern(i18nBase);
	const newWords: Record<string, Record<ioBroker.Languages, string>> = {};
	const files = await findAllLanguageFiles(i18nBase);
	for (const file of files) {
		const match = file.match(filePattern);
		if (!match) continue;
		const lang = match[2] as ioBroker.Languages;
		const translations = await readJson(file);
		for (const key of Object.keys(translations)) {
			newWords[key] = newWords[key] || createEmptyLangObject(() => "");
			newWords[key][lang] = translations[key];
		}
	}

	try {
		// merge existing and new words together (and check for missing translations)
		const existingWords = parseWordJs(await readFile(words, "utf-8"));
		for (const [key, translations] of Object.entries(existingWords)) {
			if (!newWords[key]) {
				console.warn(yellow(`Take from current words.js: ${key}`));
				newWords[key] = translations;
			}
			translateLanguages
				.filter((lang) => !newWords[key][lang])
				.forEach((lang) =>
					console.warn(yellow(`Missing "${lang}": ${key}`)),
				);
		}
	} catch {
		// ignore error, we just use the strings from the translation files
		//console.log(error);
	}

	await writeFile(words, createWordsJs(newWords));
	console.log(`Successfully updated ${path.relative(".", words)}`);
}

function createWordsJs(
	data: Record<string, Record<ioBroker.Languages, string>>,
): string {
	const lines: string[] = [];
	lines.push("/*global systemDictionary:true */");
	lines.push("/*");
	lines.push("+===================== DO NOT MODIFY ======================+");
	lines.push("| This file was generated by translate-adapter, please use |");
	lines.push("| `translate-adapter adminLanguages2words` to update it.   |");
	lines.push("+===================== DO NOT MODIFY ======================+");
	lines.push("*/");
	lines.push("'use strict';\n");
	lines.push("systemDictionary = {");
	for (const [word, translations] of Object.entries(data)) {
		let line = "";
		for (const [lang, item] of Object.entries(translations)) {
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
