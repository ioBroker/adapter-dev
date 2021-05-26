import { existsSync, readFileSync } from "fs";
import gulp, { TaskFunction } from "gulp";
import { EOL } from "os";
import path, { dirname } from "path";
import PluginError from "plugin-error";
import { Transform } from "stream";
import type * as File from "vinyl";
import Vinyl from "vinyl";
import { translateText } from "./translate";
import { escapeRegExp } from "./util";

const PLUGIN_NAME = "ioBroker";

export interface Options {
	words?: string;
	ioPackage: string;
	adminDir: string;
	i18nBase: string | string[];
}

export interface TasksBase {
	translate: TaskFunction;
}

export interface HtmlTasks extends TasksBase {
	adminWords2languages: TaskFunction;
	adminLanguages2words: TaskFunction;
	translateAndUpdateWordsJS: TaskFunction;
}

export type ReactTasks = TasksBase;

export function tasks(options?: Partial<Options>): HtmlTasks | ReactTasks {
	// figure out all options that weren't passed as argument
	const admin = valueOrDefault(options?.adminDir, () =>
		path.resolve(".", "admin"),
	);
	const opts: Options = {
		ioPackage: valueOrDefault(options?.ioPackage, () =>
			path.resolve("io-package.json"),
		),
		words: valueOrDefault(options?.words, () =>
			existsSync(path.join(admin, "words.js"))
				? path.join(admin, "words.js")
				: existsSync(path.join(admin, "js", "words.js"))
				? path.join(admin, "js", "words.js")
				: undefined,
		),
		adminDir: admin,
		i18nBase: valueOrDefault(options?.i18nBase, () =>
			[
				path.join(admin, "i18n", "en", "translations.json"),
				path.join(admin, "src", "i18n", "en.json"),
			].filter(existsSync),
		),
	};

	const i18nBase = !Array.isArray(opts.i18nBase)
		? [opts.i18nBase]
		: opts.i18nBase.length > 0
		? opts.i18nBase
		: [path.join(admin, "i18n", "en", "translations.json")];

	const translate = gulp.series(
		() =>
			gulp
				.src(opts.ioPackage)
				.pipe(translateIoPackage())
				.pipe(gulp.dest(dirname(opts.ioPackage))),
		...i18nBase.map((base) => () =>
			gulp
				.src(path.join(admin, "**", "*.json"))
				.pipe(filterLanguageFiles(base))
				.pipe(translateI18n(base))
				.pipe(gulp.dest(admin)),
		),
	);

	if (!opts.words) {
		return {
			translate,
		};
	}

	const adminW2L = gulp.series(() =>
		gulp
			.src(opts.words!)
			.pipe(adminWords2languages(i18nBase[0]))
			.pipe(gulp.dest(opts.adminDir)),
	);
	const adminL2W = gulp.series(() =>
		gulp
			.src(path.join(admin, "**", "*.json"))
			.pipe(filterLanguageFiles(i18nBase[0]))
			.pipe(adminLanguages2words(opts.words!, i18nBase[0]))
			.pipe(gulp.dest(opts.adminDir)),
	);

	return {
		adminWords2languages: adminW2L,
		adminLanguages2words: adminL2W,
		translate,
		translateAndUpdateWordsJS: gulp.series(translate, adminL2W, adminW2L),
	};
}

function valueOrDefault<T>(value: T | undefined, creator: () => T): T {
	return value === undefined ? creator() : value;
}

function stringifyToBuffer(value: any, encoding: BufferEncoding): Buffer {
	return Buffer.from(JSON.stringify(value, null, 4), encoding);
}

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

function createEmptyLangObject<T>(): Record<Language, T> {
	return JSON.parse(JSON.stringify(_languages));
}

/*
 * Gulp tasks provided for ioBroker.
 */
export function translateIoPackage(): Transform {
	return new Transform({
		objectMode: true,
		transform(file: File, encoding, callback) {
			if (file.isNull()) {
				// nothing to do
				return callback(null, file);
			}

			if (file.isStream()) {
				this.emit(
					"error",
					new PluginError(PLUGIN_NAME, "Streams not supported!"),
				);
			} else if (file.isBuffer()) {
				const content = JSON.parse(file.contents.toString(encoding));
				translateIoPackageJson(content)
					.then(() => {
						file.contents = stringifyToBuffer(content, encoding);
						callback(null, file);
					})
					.catch((e) => callback(e));
			}
		},
	});
}

export function filterLanguageFiles(baseFile: string): Transform {
	const filePattern = createFilePattern(baseFile);
	return new Transform({
		objectMode: true,
		transform(file: File, encoding, callback) {
			if (file.isStream()) {
				return callback(
					new PluginError(PLUGIN_NAME, "Streams not supported!"),
				);
			} else if (file.isBuffer()) {
				const match = file.path.match(filePattern);
				if (!match) {
					console.debug(`${file.path} is not an i18n file`);
					return callback(null);
				}
				const lang = match[2] as Language;
				if (!getLanguages().includes(lang)) {
					console.warn(`${file.path} is not a supported i18n file`);
					return callback(null);
				}

				return callback(null, file);
			}

			return callback(null);
		},
	});
}

export function translateI18n(baseFile: string): Transform {
	const filePattern = createFilePattern(baseFile);
	const baseContent = JSON.parse(
		readFileSync(baseFile, { encoding: "utf8" }),
	);
	const missingLanguages = getLanguages();
	let firstFile: File | undefined;
	return new Transform({
		objectMode: true,
		transform(file: File, encoding, callback) {
			if (file.isBuffer()) {
				const match = file.path.match(filePattern);
				const lang = match![2] as Language;
				const langIndex = missingLanguages.indexOf(lang);
				if (!firstFile) {
					firstFile = file;
				}
				missingLanguages.splice(langIndex, 1);
				const content = JSON.parse(file.contents.toString(encoding));
				translateI18nJson(content, lang, baseContent)
					.then(() => {
						file.contents = stringifyToBuffer(content, encoding);
						callback(null, file);
					})
					.catch((e) => callback(e));
			} else {
				return callback(null, file);
			}
		},
		flush(callback) {
			const vinylBase = firstFile!;
			translateMissingI18nJsons(missingLanguages, baseContent)
				.then((files) => {
					Object.keys(files).forEach((lang) =>
						this.push(
							new Vinyl({
								cwd: vinylBase.cwd,
								base: vinylBase.base,
								path: vinylBase.path.replace(
									filePattern,
									`$1${lang}$3`,
								),
								contents: stringifyToBuffer(
									files[lang as Language],
									"utf8",
								),
							}),
						),
					);
					callback();
				})
				.catch((e) => callback(e));
		},
	});
}

export function adminWords2languages(i18nBase: string): Transform {
	const filePattern = createFilePattern(i18nBase);
	let data: Record<string, Record<Language, string>> | undefined;
	let firstFile: File | undefined;
	return new Transform({
		objectMode: true,
		transform(file: File, encoding, callback) {
			if (file.isNull()) {
				// nothing to do
				return callback(null, file);
			}

			if (file.isStream()) {
				this.emit(
					"error",
					new PluginError(PLUGIN_NAME, "Streams not supported!"),
				);
			} else if (file.isBuffer()) {
				if (!firstFile) {
					firstFile = file;
				}
				data = data || readWordJs(file.contents.toString(encoding));
				callback(null, file);
			}
		},
		flush(callback) {
			if (!data) {
				return callback(
					new PluginError(PLUGIN_NAME, "No words.js found in input"),
				);
			}

			const langs = createEmptyLangObject<Record<string, string>>();
			for (const word in data) {
				if (data.hasOwnProperty(word)) {
					for (const lang in data[word]) {
						if (data[word].hasOwnProperty(lang)) {
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
				}
			}

			const vinylBase = firstFile!;
			for (const lang in langs) {
				if (!langs.hasOwnProperty(lang)) continue;
				const keys = Object.keys(langs[lang as Language]);
				keys.sort();
				const obj: Record<string, string> = {};
				for (let k = 0; k < keys.length; k++) {
					obj[keys[k]] = langs[lang as Language][keys[k]];
				}
				this.push(
					new Vinyl({
						cwd: vinylBase.cwd,
						base: vinylBase.base,
						path: i18nBase.replace(filePattern, `$1${lang}$3`),
						contents: stringifyToBuffer(obj, "utf8"),
					}),
				);
			}
			callback();
		},
	});
}

export function adminLanguages2words(
	wordsPath: string,
	i18nBase: string,
): Transform {
	const filePattern = createFilePattern(i18nBase);
	const newWords: Record<string, Record<Language, string>> = {};
	let firstFile: File | undefined;
	return new Transform({
		objectMode: true,
		transform(file: File, encoding, callback) {
			if (file.isBuffer()) {
				const match = file.path.match(filePattern);
				const lang = match![2] as Language;
				if (!firstFile) {
					firstFile = file;
				}
				const translations = JSON.parse(
					file.contents.toString(encoding),
				);
				for (const key in translations) {
					if (translations.hasOwnProperty(key)) {
						newWords[key] =
							newWords[key] || createEmptyLangObject<string>();
						newWords[key][lang] = translations[key];
					}
				}
			}
			return callback();
		},
		flush(callback) {
			try {
				// merge existing and new words together (and check for missing translations)
				const existingWords = readWordJs(
					readFileSync(wordsPath, "utf8"),
				);
				for (const key in existingWords) {
					if (existingWords.hasOwnProperty(key)) {
						const translations = existingWords[key];
						if (!newWords[key]) {
							console.warn(`Take from current words.js: ${key}`);
							newWords[key] = translations;
						}
						getLanguages()
							.filter((lang) => !newWords[key][lang])
							.forEach((lang) =>
								console.warn(`Missing "${lang}": ${key}`),
							);
					}
				}
			} catch {
				// ignore error, we just use the strings from the translation files
			}

			const vinylBase = firstFile!;
			this.push(
				new Vinyl({
					cwd: vinylBase.cwd,
					base: vinylBase.base,
					path: wordsPath,
					contents: Buffer.from(createWordJs(newWords), "utf8"),
				}),
			);
			callback();
		},
	});
}

/*
 * Helper functions used by gulp tasks.
 */

async function translateIoPackageJson(ioPackage: any): Promise<void> {
	if (ioPackage.common.news) {
		console.log("Translate News");
		for (const k in ioPackage.common.news) {
			console.log(`News: ${k}`);
			const nw = ioPackage.common.news[k];
			await translateNotExisting(nw);
		}
	}
	if (ioPackage.common.titleLang) {
		console.log("Translate Title");
		await translateNotExisting(
			ioPackage.common.titleLang,
			ioPackage.common.title,
		);
	}
	if (ioPackage.common.desc) {
		console.log("Translate Description");
		await translateNotExisting(ioPackage.common.desc);
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
		`Translate Admin en -> ${lang} ${new Date().getTime() - time} ms`,
	);
}

async function translateMissingI18nJsons(
	missingLanguages: Language[],
	baseContent: Readonly<Record<string, string>>,
): Promise<Partial<Record<Language, Record<string, string>>>> {
	const translations: Partial<Record<Language, Record<string, string>>> = {};
	for (const lang of missingLanguages) {
		const translation: Record<string, string> = {};
		await translateI18nJson(translation, lang, baseContent);
		translations[lang] = translation;
	}
	return translations;
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
			if (!obj[lang as Language]) {
				const time = new Date().getTime();
				obj[lang as Language] = await translateText(text, lang);
				console.log(`en -> ${lang} ${new Date().getTime() - time} ms`);
			}
		}
	}
}

function readWordJs(words: string): Record<string, Record<Language, string>> {
	words = words.substring(words.indexOf("{"), words.length);
	words = words.substring(0, words.lastIndexOf(";"));

	const resultFunc = new Function("return " + words + ";");

	return resultFunc();
}

function padRight(text: string, totalLength: number): string {
	return (
		text +
		(text.length < totalLength
			? new Array(totalLength - text.length).join(" ")
			: "")
	);
}

function createWordJs(data: Record<string, Record<Language, string>>): string {
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
		if (data.hasOwnProperty(word)) {
			let line = "";
			for (const lang in data[word]) {
				if (data[word].hasOwnProperty(lang)) {
					const item = data[word][lang as Language];
					const text = padRight(item.replace(/"/g, '\\"') + '",', 50);
					line += `"${lang}": "${text} `;
				}
			}
			if (line) {
				line = line.trim();
				line = line.substring(0, line.length - 1);
			}
			const preamble = padRight(`"${word.replace(/"/g, '\\"')}": {`, 50);
			lines.push(`    ${preamble}${line}},`);
		}
	}
	lines.push("};");
	return lines.join(EOL).trimEnd();
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
