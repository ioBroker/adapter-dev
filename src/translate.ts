import { TranslationServiceClient } from "@google-cloud/translate";
import axios, { type AxiosRequestConfig } from "axios";
import * as deepl from "deepl-node";
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
		const retryMessage = retryAfter
			? ` (retry after ${retryAfter} seconds)`
			: "";
		super(
			`Skipping translation to "${targetLang}" due to rate limiting${retryMessage}`,
		);
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
 * @param key Optional key name for better error reporting
 * @returns The translated text
 * @throws {TranslationSkippedError} When translation is skipped due to rate limiting
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
		// Check if this is a rate limiting error
		if (e.response?.status === 429) {
			// Set rate limiting state
			isRateLimited = true;

			// Extract retry-after header if available
			const retryAfter = e.response.headers["retry-after"];
			if (retryAfter) {
				rateLimitRetryAfter = parseInt(retryAfter, 10);
			}

			// Throw TranslationSkippedError for rate limiting
			throw new TranslationSkippedError(targetLang, rateLimitRetryAfter);
		}

		const keyInfo = key ? ` for key "${key}"` : "";
		const message = `Could not translate to "${targetLang}"${keyInfo}: ${e.message || e}. The UI can display the original text or key name as fallback.`;
		error(message);
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

	if (process.env.DEEPL_API_KEY) {
		const deeplTranslator = new DeeplTranslator();
		try {
			await deeplTranslator.init();
			console.log("Using DeepL Translate");
			return deeplTranslator;
		} catch (err: any) {
			error(err);
		}
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
 * @see Translator implementation that uses the DeepL API.
 * This API requires an API key which must be stored in the
 * environment variable DEEPL_API_KEY.
 */
class DeeplTranslator implements Translator {
	private translator!: deepl.Translator;

	async init(): Promise<void> {
		const apiKey = process.env.DEEPL_API_KEY;
		if (!apiKey) {
			throw new Error("DEEPL_API_KEY environment variable is required");
		}
		this.translator = new deepl.Translator(apiKey);
		
		// Test the connection by getting usage info
		await this.translator.getUsage();
	}

	/**
	 * Maps ioBroker language codes to DeepL language codes
	 */
	private mapLanguageCode(ioBrokerLang: string): string {
		const languageMap: Record<string, string> = {
			"zh-cn": "zh", // ioBroker uses zh-cn, DeepL uses zh
			// All other codes match directly
		};
		
		return languageMap[ioBrokerLang] || ioBrokerLang;
	}

	async translate(text: string, targetLang: string): Promise<string> {
		const deeplTargetLang = this.mapLanguageCode(targetLang);
		
		try {
			const result = await this.translator.translateText(
				text,
				"en",
				deeplTargetLang as deepl.TargetLanguageCode,
			);
			
			return result.text;
		} catch (err: any) {
			// Handle DeepL-specific errors
			if (err instanceof deepl.QuotaExceededError) {
				throw new Error(`DeepL quota exceeded: ${err.message}`);
			} else if (err instanceof deepl.TooManyRequestsError) {
				// Convert to a format that our rate limiting detection understands
				const rateLimitError = new Error(`DeepL rate limit exceeded: ${err.message}`);
				(rateLimitError as any).response = { status: 429 };
				throw rateLimitError;
			} else if (err instanceof deepl.AuthorizationError) {
				throw new Error(`DeepL authorization failed: ${err.message}`);
			}
			
			throw new Error(`DeepL couldn't translate "${text}": ${err.message}`);
		}
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

		throw new Error(`Invalid response for translate request`);
	}
}
