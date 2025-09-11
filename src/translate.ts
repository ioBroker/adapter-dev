import {
	type Translator,
	TestingTranslator,
	DeeplTranslator,
	GoogleV3Translator,
	LegacyTranslator,
} from "./translators";
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


