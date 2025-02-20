import { gray, yellow } from 'ansi-colors';
import { ensureDir, existsSync, readFileSync, readJson, stat, writeFile, writeJson } from 'fs-extra';
import { join, dirname, resolve, relative } from 'path';
import { translateText } from './translate';
import { die, escapeRegExp, getIndentation, padRight } from './util';
import { readdirSync, rmdirSync, unlinkSync } from 'node:fs';

let ioPackage: string;
let admin: string;
let words: string;
let i18nBases: string[];
let translateLanguages: ioBroker.Languages[];

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
    'zh-cn': {},
};

export const allLanguages = Object.keys(_languages) as ioBroker.Languages[];

function createEmptyLangObject<T>(createDefault: () => T): Record<ioBroker.Languages, T> {
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
        throw new Error('Base file must be an English JSON file');
    }
    return new RegExp(`^(${escapeRegExp(baseFile).replace(/(?<=\W)en(?=\W)/, ')([a-z-]+)(')})$`, 'i');
}

function findAllLanguageFiles(baseFile: string): string[] {
    const baseDir = dirname(baseFile);
    return readdirSync(baseDir)
        .filter(file => file.endsWith('.json'))
        .map(file => join(baseDir, file));
}

/** Convert the "LANG/translation.json" files to "LANG.json" files */
async function convertTranslationJson2LanguageJson(basePath: string): Promise<void> {
    const dirs = readdirSync(basePath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    for (const dir of dirs) {
        const langPath = join(basePath, dir, 'translations.json');
        const text: Record<string, string> = await readJson(langPath);
        await writeJson(join(basePath, `${dir}.json`), text, { spaces: 4, EOL: '\n' });
        unlinkSync(langPath);
        rmdirSync(join(basePath, dir));
    }
}

/******************************** Middlewares *********************************/

export async function parseOptions(options: {
    'io-package': string;
    admin: string;
    words?: string;
    base?: string[];
    languages?: string[];
}): Promise<void> {
    // io-package.json
    ioPackage = resolve(options['io-package']);
    if (!existsSync(ioPackage) || !(await stat(ioPackage)).isFile()) {
        return die(`Couldn't find file ${ioPackage}`);
    }

    // admin directory
    admin = resolve(options.admin);
    if (!existsSync(admin) || !(await stat(admin)).isDirectory()) {
        return die(`Couldn't find directory ${admin}`);
    }

    // words.js
    if (options.words) {
        words = resolve(options.words);
    } else if (existsSync(join(admin, 'js', 'words.js'))) {
        words = join(admin, 'js', 'words.js');
    } else {
        words = join(admin, 'words.js');
    }

    // i18n base file
    if (options.base) {
        i18nBases = options.base.map(p => resolve(p));
    } else {
        // Convert en/translations.json to en.json permanently
        if (existsSync(join(admin, 'i18n', 'en', 'translations.json'))) {
            await convertTranslationJson2LanguageJson(join(admin, 'i18n'));
        }
        // Add possible paths:
        // - admin/i18n/en.json
        // - admin/src/i18n/en.json
        // - src/src/i18n/en.json
        // - src-admin/src/i18n/en.json
        i18nBases = [
            join(admin, 'i18n', 'en.json'),
            join(admin, 'src', 'i18n', 'en.json'),
            join('src', 'src', 'i18n', 'en.json'),
            join('src-admin', 'src', 'i18n', 'en.json'),
        ].filter(existsSync);
        if (!i18nBases.length) {
            // if no path exists, we are most likely using words.js and
            // expect the i18n file to be in the default path
            i18nBases = [join(admin, 'src', 'i18n', 'en.json')];
        }
    }

    if (options.languages?.length) {
        // Check if an unknown language was specified
        const unknownLanguages = options.languages.filter(l => !allLanguages.includes(l as any));
        if (unknownLanguages.length > 0) {
            return die(`Unknown language(s): ${unknownLanguages.join(', ')}`);
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
    // await handleToWordsCommand();
    // await handleToJsonCommand();
}

/****************************** Implementation ********************************/

async function translateIoPackage(): Promise<void> {
    const ioPackageFile = readFileSync(ioPackage, 'utf-8');
    const indentation = getIndentation(ioPackageFile);
    const content = JSON.parse(ioPackageFile);

    if (content.common.news) {
        console.log('Translate News');
        for (const [k, nw] of Object.entries(content.common.news)) {
            console.log(`News: ${k}`);
            await translateNotExisting(nw as any);
        }
    }
    if (content.common.titleLang) {
        console.log('Translate Title');
        await translateNotExisting(content.common.titleLang, content.common.title);
    }
    if (content.common.desc) {
        console.log('Translate Description');
        await translateNotExisting(content.common.desc);
    }
    // https://github.com/ioBroker/adapter-dev/issues/138
    if (content.common.messages) {
        console.log('Translate Messages');
        for (const message of content.common.messages) {
            console.log(`   Message: ${message.title.en}`);
            await translateNotExisting(message.title);
            await translateNotExisting(message.text);
            if (message.linkText) {
                await translateNotExisting(message.linkText);
            }
        }
    }
    await writeJson(ioPackage, content, { spaces: indentation, EOL: '\n' });
    console.log(`Successfully updated ${relative('.', ioPackage)}`);
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
                console.log(gray(`en -> ${lang} ${new Date().getTime() - time} ms`));
            }
        }
    }
}

async function translateI18n(baseFile: string): Promise<void> {
    const baseContent = await readJson(baseFile);
    const missingLanguages = new Set<ioBroker.Languages>(translateLanguages);
    const files = findAllLanguageFiles(baseFile);
    for (const file of files) {
        const lang = file.split('.')[0] as ioBroker.Languages;
        missingLanguages.delete(lang);
        if (lang === 'en') {
            continue;
        }
        const translation = await readJson(file);
        await translateI18nJson(translation, lang, baseContent);
        await writeJson(file, translation, { spaces: 4, EOL: '\n' });
        console.log(`Successfully updated ${relative('.', file)}`);
    }

    for (const lang of missingLanguages) {
        const translation: Record<string, string> = {};
        await translateI18nJson(translation, lang, baseContent);
        const filename = baseFile.replace('en.', `${lang}.`);
        await ensureDir(dirname(filename));
        await writeJson(filename, translation, {
            spaces: 4,
            EOL: '\n',
        });
        console.log(`Successfully created ${relative('.', filename)}`);
    }
}

async function translateI18nJson(
    content: Record<string, string>,
    lang: ioBroker.Languages,
    baseContent: Readonly<Record<string, string>>,
): Promise<void> {
    if (lang === 'en') {
        return;
    }
    const time = new Date().getTime();
    for (const [t, base] of Object.entries(baseContent)) {
        if (!content[t]) {
            content[t] = await translateText(base, lang);
        }
    }
    console.log(gray(`Translate Admin en -> ${lang} ${new Date().getTime() - time} ms`));
}

async function adminWords2languages(words: string, i18nBase: string): Promise<void> {
    const filePattern = createFilePattern(i18nBase);
    const data = parseWordJs(readFileSync(words, 'utf-8'));
    const langs = createEmptyLangObject(() => ({}) as Record<string, string>);
    for (const [word, translations] of Object.entries(data)) {
        for (const [lang, translation] of Object.entries(translations)) {
            const language = lang as ioBroker.Languages;
            langs[language][word] = translation;
            //  pre-fill all other languages
            for (const j of translateLanguages) {
                if (Object.prototype.hasOwnProperty.call(langs, j)) {
                    langs[j][word] = langs[j][word] || '';
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
        await ensureDir(dirname(filename));
        await writeJson(filename, obj, {
            spaces: 4,
            EOL: '\n',
        });
        console.log(`Successfully updated ${relative('.', filename)}`);
    }
}

function parseWordJs(words: string): Record<string, Record<ioBroker.Languages, string>> {
    words = words.substring(words.indexOf('{'), words.length);
    words = words.substring(0, words.lastIndexOf(';'));

    const resultFunc = new Function(`return ${words};`);

    return resultFunc();
}

async function adminLanguages2words(i18nBase: string): Promise<void> {
    const filePattern = createFilePattern(i18nBase);
    const newWords: Record<string, Record<ioBroker.Languages, string>> = {};
    const files = findAllLanguageFiles(i18nBase);
    for (const file of files) {
        const match = file.match(filePattern);
        if (!match) {
            continue;
        }
        const lang = match[2] as ioBroker.Languages;
        const translations = await readJson(file);
        for (const key of Object.keys(translations)) {
            newWords[key] = newWords[key] || createEmptyLangObject(() => '');
            newWords[key][lang] = translations[key];
        }
    }

    try {
        // merge existing and new words together (and check for missing translations)
        const existingWords = parseWordJs(readFileSync(words, 'utf-8'));
        for (const [key, translations] of Object.entries(existingWords)) {
            if (!newWords[key]) {
                console.warn(yellow(`Take from current words.js: ${key}`));
                newWords[key] = translations;
            }
            translateLanguages
                .filter(lang => !newWords[key][lang])
                .forEach(lang => console.warn(yellow(`Missing "${lang}": ${key}`)));
        }
    } catch {
        // ignore error, we just use the strings from the translation files
        //console.log(error);
    }

    await writeFile(words, createWordsJs(newWords));
    console.log(`Successfully updated ${relative('.', words)}`);
}

function createWordsJs(data: Record<string, Record<ioBroker.Languages, string>>): string {
    const lines: string[] = [];
    lines.push('/*global systemDictionary:true */');
    lines.push('/*');
    lines.push('+===================== DO NOT MODIFY ======================+');
    lines.push('| This file was generated by translate-adapter, please use |');
    lines.push('| `translate-adapter adminLanguages2words` to update it.   |');
    lines.push('+===================== DO NOT MODIFY ======================+');
    lines.push('*/');
    lines.push("'use strict';\n");
    lines.push('systemDictionary = {');
    for (const [word, translations] of Object.entries(data)) {
        let line = '';
        for (const [lang, item] of Object.entries(translations)) {
            const text = padRight(`${item.replace(/"/g, '\\"')}",`, 50);
            line += `"${lang}": "${text} `;
        }
        if (line) {
            line = line.trim();
            line = line.substring(0, line.length - 1);
        }
        const preamble = padRight(`"${word.replace(/"/g, '\\"')}": {`, 50);
        lines.push(`    ${preamble}${line}},`);
    }
    lines.push('};');
    return lines.join('\n').trimEnd();
}
