import { TranslationServiceClient } from "@google-cloud/translate";
import axios, { type AxiosRequestConfig } from "axios";
import { readJson } from "fs-extra";
import { applyHttpsProxy, getRequestTimeout } from "./network";
import { error } from "./util";

const translationCache = new Map<string, Map<string, string>>();

/**
 * Translates text using the Google Translate API.
 *
 * @param text The text to translate
 * @param targetLang The target language code
 * @param key Optional key name for better error reporting
 * @returns The translated text or the same text if translation failed.
 */
export async function translateText(
	text: string,
	targetLang: string,
	key?: string,
): Promise<string> {
	if (targetLang === "en") {
		return text;
	}

	// Handle empty strings with specific error message
	if (text.trim() === "") {
		const keyInfo = key ? ` for key "${key}"` : "";
		const message = `Could not translate to "${targetLang}"${keyInfo}: Empty source text. Consider providing default text or the UI can display the key name as fallback.`;
		error(message);
		return text;
	}

	// Try to read the translation from the translation cache
	if (!translationCache.has(targetLang)) {
		translationCache.set(targetLang, new Map());
	}
	const langCache = translationCache.get(targetLang)!;

	// or fall back to an online translation
	if (!langCache.has(text)) {
		const translator = await getTranslator();
		let translated;
		try {
			translated = await translator.translate(text, targetLang);
		} catch (e: any) {
			const keyInfo = key ? ` for key "${key}"` : "";
			const message = `Could not translate to "${targetLang}"${keyInfo}: ${e.message || e}. The UI can display the original text or key name as fallback.`;
			error(message);
			return text;
		}
		langCache.set(text, translated);
	}
	return langCache.get(text)!;
}

/**
 * This interface must be implemented to provide a different translation service.
 */
interface Translator {
	translate(text: string, targetLang: string): Promise<string>;
}

async function createTranslator(): Promise<Translator> {
	if (process.env.TESTING) {
		console.log("Using dummy testing translation");
		return new TestingTranslator();
	}

	if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
		const v3 = new GoogleV3Translator();
		try {
			await v3.init();
			console.log("Using Google Translate V3");
			return v3;
		} catch (err: any) {
			error(err);
		}
	}

	console.log("Using Legacy Google Translate");
	return new LegacyTranslator();
}

let creator: Promise<Translator> | undefined = undefined;
function getTranslator(): Promise<Translator> {
	if (!creator) {
		creator = createTranslator();
	}
	return creator;
}

/**
 * @see Translator implementation that is used for testing.
 * It returns a mock text.
 */
class TestingTranslator implements Translator {
	translate(text: string, targetLang: string): Promise<string> {
		return Promise.resolve(
			`Mock translation of '${text}' to '${targetLang}'`,
		);
	}
}

/**
 * @see Translator implementation that uses the Google Translation API.
 * This API requires credentials which must be stored in a file pointed to
 * by the environment variable GOOGLE_APPLICATION_CREDENTIALS.
 */
class GoogleV3Translator implements Translator {
	private credentials: any;
	private translationClient!: TranslationServiceClient;

	async init(): Promise<void> {
		this.credentials = await readJson(
			process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
		);
		this.translationClient = new TranslationServiceClient();
	}

	async translate(text: string, targetLang: string): Promise<string> {
		const request = {
			parent: `projects/${this.credentials.project_id}/locations/global`,
			contents: [text],
			mimeType: "text/plain",
			sourceLanguageCode: "en",
			targetLanguageCode: targetLang,
		};
		const [response] = await this.translationClient.translateText(request);
		if (response.translations && response.translations[0]?.translatedText) {
			return response.translations[0].translatedText;
		}

		throw new Error(`Google couldn't translate "${text}"`);
	}
}

/**
 * @see Translator implementation that uses the old Google Translation API.
 * This API is rate limited and the user will see an error if too many
 * translation requests are done within a given timespan.
 */
class LegacyTranslator implements Translator {
	async translate(text: string, targetLang: string): Promise<string> {
		try {
			const url = `http://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(
				text,
			)}&ie=UTF-8&oe=UTF-8`;
			let options: AxiosRequestConfig = {
				url,
				timeout: getRequestTimeout(),
			};

			// If an https-proxy is defined as an env variable, use it
			options = applyHttpsProxy(options);

			const response = await axios(options);
			if (Array.isArray(response.data)) {
				// we got a valid response
				return response.data[0].map((t: string[]) => t[0]).join("");
			}
		} catch (e: any) {
			if (e.response?.status === 429) {
				throw new Error(
					`Could not translate to "${targetLang}": Rate-limited by Google Translate`,
				);
			} else {
				throw e;
			}
		}

		throw new Error(`Invalid response for translate request`);
	}
}
