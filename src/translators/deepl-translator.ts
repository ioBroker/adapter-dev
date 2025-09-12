import * as deepl from "deepl-node";
import { RateLimitedError } from "../translate";
import type { Translator } from "./types";

/**
 * @see Translator implementation that uses the DeepL API.
 * This API requires an API key which must be stored in the
 * environment variable DEEPL_API_KEY.
 */
export class DeeplTranslator implements Translator {
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
				throw new RateLimitedError(
					`DeepL quota exceeded: ${err.message}`,
				);
			} else if (err instanceof deepl.TooManyRequestsError) {
				throw new RateLimitedError(
					`DeepL rate limit exceeded: ${err.message}`,
				);
			} else if (err instanceof deepl.AuthorizationError) {
				throw new Error(`DeepL authorization failed: ${err.message}`);
			}

			throw new Error(
				`DeepL couldn't translate "${text}": ${err.message}`,
			);
		}
	}
}
