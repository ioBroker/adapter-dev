import { TranslationServiceClient } from "@google-cloud/translate";
import axios, { type AxiosRequestConfig } from "axios";
import { readJson } from "fs-extra";
import { applyHttpsProxy, getRequestTimeout } from "./network";
import { error } from "./util";

const translationCache = new Map<string, Map<string, string>>();

// Rate limiting state
let isRateLimited = false;
let rateLimitRetryAfter: number | undefined;

/**
 * Custom error class thrown when translation is skipped due to rate limiting
 */
export class TranslationSkippedError extends Error {
	public readonly retryAfter?: number;

	constructor(targetLang: string, retryAfter?: number) {
		const retryMessage = retryAfter ? ` (retry after ${retryAfter} seconds)` : "";
		super(`Skipping translation to "${targetLang}" due to rate limiting${retryMessage}`);
		this.name = "TranslationSkippedError";
		this.retryAfter = retryAfter;
	}
}

/**
 * Resets the rate limiting state. Useful for testing or when starting a new translation session.
 */
export function resetRateLimitState(): void {
	isRateLimited = false;
	rateLimitRetryAfter = undefined;
}

/**
 * Clears the translation cache. Useful for testing.
 */
export function clearTranslationCache(): void {
	translationCache.clear();
}

/**
 * Gets the current rate limiting state. Useful for testing.
 */
export function getRateLimitState(): {
	isRateLimited: boolean;
	rateLimitRetryAfter?: number;
} {
	return { isRateLimited, rateLimitRetryAfter };
}

/**
 * Sets the rate limiting state. Useful for testing.
 */
export function setRateLimitState(
	rateLimited: boolean,
	retryAfter?: number,
): void {
	isRateLimited = rateLimited;
	rateLimitRetryAfter = retryAfter;
}

/**
 * Translates text using the Google Translate API.
 *
 * @param text The text to translate
 * @param targetLang The target language code
 * @returns The translated text
 * @throws {TranslationSkippedError} When translation is skipped due to rate limiting
 */
export async function translateText(
	text: string,
	targetLang: string,
): Promise<string> {
	if (targetLang === "en") {
		return text;
	}

	// Try to read the translation from the translation cache first
	if (!translationCache.has(targetLang)) {
		translationCache.set(targetLang, new Map());
	}
	const langCache = translationCache.get(targetLang)!;

	// Return cached translation if available
	if (langCache.has(text)) {
		return langCache.get(text)!;
	}

	// Skip new translation requests if we're rate limited
	if (isRateLimited) {
		throw new TranslationSkippedError(targetLang, rateLimitRetryAfter);
	}

	// Fall back to an online translation
	const translator = await getTranslator();
	let translated;
	try {
		translated = await translator.translate(text, targetLang);
	} catch (e: any) {
		error(`Could not translate to "${targetLang}": ${e}`);
		return text;
	}
	langCache.set(text, translated);
	return translated;
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
				// Set rate limiting state
				isRateLimited = true;

				// Extract retry-after header if available
				const retryAfter = e.response.headers["retry-after"];
				if (retryAfter) {
					rateLimitRetryAfter = parseInt(retryAfter, 10);
				}

				const retryMessage = rateLimitRetryAfter
					? ` Retry after ${rateLimitRetryAfter} seconds.`
					: "";
				throw new Error(
					`Could not translate to "${targetLang}": Rate-limited by Google Translate.${retryMessage}`,
				);
			} else {
				throw e;
			}
		}

		throw new Error(`Invalid response for translate request`);
	}
}
