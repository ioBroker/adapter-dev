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
let rateLimitMaxWaitTime = 10; // Default max wait time in seconds
let translationsSkippedDueToRateLimit = false;

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
 * Custom error class for rate limiting and quota exceeded errors
 */
export class RateLimitedError extends Error {
	public readonly response: {
		status: number;
		headers?: Record<string, string>;
	};
	public readonly retryAfter?: number;

	constructor(
		message: string,
		retryAfter?: number,
		headers?: Record<string, string>,
	) {
		super(message);
		this.name = "RateLimitedError";
		this.response = { status: 429, headers };
		this.retryAfter = retryAfter;
	}
}

/**
 * Resets the rate limiting state. Useful for testing or when starting a new translation session.
 */
export function resetRateLimitState(): void {
	isRateLimited = false;
	rateLimitRetryAfter = undefined;
	translationsSkippedDueToRateLimit = false;
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
	translationsSkippedDueToRateLimit: boolean;
} {
	return {
		isRateLimited,
		rateLimitRetryAfter,
		translationsSkippedDueToRateLimit,
	};
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
 * Sets the maximum wait time for rate limiting retries.
 *
 * @param seconds Maximum wait time in seconds. Set to 0 to disable retries.
 */
export function setRateLimitMaxWaitTime(seconds: number): void {
	rateLimitMaxWaitTime = seconds;
}

/**
 * Gets whether any translations were skipped due to rate limiting.
 */
export function getTranslationsSkippedDueToRateLimit(): boolean {
	return translationsSkippedDueToRateLimit;
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
	let retryCount = 0;
	const maxRetries = 1;

	while (retryCount <= maxRetries) {
		try {
			translated = await translator.translate(text, targetLang);
			langCache.set(text, translated);
			return translated;
		} catch (e: any) {
			// Check if this is a rate limiting error
			if (e instanceof RateLimitedError || e.response?.status === 429) {
				// Extract retry-after from RateLimitedError or headers
				let retryAfter: number | undefined;
				if (e instanceof RateLimitedError && e.retryAfter) {
					retryAfter = e.retryAfter;
				} else if (e.response?.headers?.["retry-after"]) {
					retryAfter = parseInt(
						e.response.headers["retry-after"],
						10,
					);
				}

				// Log detailed rate limit information
				const keyInfo = key ? ` for key "${key}"` : "";
				if (retryAfter !== undefined) {
					console.log(
						`Rate limit hit${keyInfo}. Server requests waiting ${retryAfter} seconds before retry.`,
					);
				} else {
					console.log(
						`Rate limit hit${keyInfo}. No retry-after time provided.`,
					);
				}

				// Decide whether to retry or fail
				const shouldRetry =
					retryCount < maxRetries &&
					rateLimitMaxWaitTime > 0 &&
					retryAfter !== undefined &&
					retryAfter <= rateLimitMaxWaitTime;

				if (shouldRetry) {
					const waitTime = retryAfter! + 1; // Wait 1 second longer than requested
					console.log(
						`Waiting ${waitTime} seconds (${retryAfter} + 1s buffer) before retrying...`,
					);
					await new Promise(resolve =>
						setTimeout(resolve, waitTime * 1000),
					);
					retryCount++;
					continue; // Retry the translation
				} else {
					// Set rate limiting state to skip further translations
					isRateLimited = true;
					rateLimitRetryAfter = retryAfter;
					translationsSkippedDueToRateLimit = true;

					if (retryCount > 0) {
						console.log(
							`Rate limit hit again after retry. Skipping further translations.`,
						);
					} else if (rateLimitMaxWaitTime === 0) {
						console.log(
							`Rate limit max wait time is 0. Skipping translation without retry.`,
						);
					} else if (retryAfter === undefined) {
						console.log(
							`No retry-after time provided. Skipping further translations.`,
						);
					} else if (retryAfter > rateLimitMaxWaitTime) {
						console.log(
							`Retry-after time (${retryAfter}s) exceeds max wait time (${rateLimitMaxWaitTime}s). Skipping further translations.`,
						);
					}

					// Throw TranslationSkippedError for rate limiting
					throw new TranslationSkippedError(
						targetLang,
						rateLimitRetryAfter,
					);
				}
			}

			// Non-rate-limit error
			const keyInfo = key ? ` for key "${key}"` : "";
			const message = `Could not translate to "${targetLang}"${keyInfo}: ${e.message || e}. The UI can display the original text or key name as fallback.`;
			error(message);
			return text;
		}
	}

	// Should not reach here, but just in case
	return text;
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
