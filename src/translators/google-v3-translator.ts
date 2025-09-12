import { TranslationServiceClient } from "@google-cloud/translate";
import { readJson } from "fs-extra";
import { RateLimitedError } from "../translate";
import type { Translator } from "./types";

/**
 * @see Translator implementation that uses the Google Translation API.
 * This API requires credentials which must be stored in a file pointed to
 * by the environment variable GOOGLE_APPLICATION_CREDENTIALS.
 */
export class GoogleV3Translator implements Translator {
	private credentials: any;
	private translationClient!: TranslationServiceClient;

	async init(): Promise<void> {
		this.credentials = await readJson(
			process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
		);
		this.translationClient = new TranslationServiceClient();
	}

	async translate(text: string, targetLang: string): Promise<string> {
		try {
			const request = {
				parent: `projects/${this.credentials.project_id}/locations/global`,
				contents: [text],
				mimeType: "text/plain",
				sourceLanguageCode: "en",
				targetLanguageCode: targetLang,
			};
			const [response] =
				await this.translationClient.translateText(request);
			if (
				response.translations &&
				response.translations[0]?.translatedText
			) {
				return response.translations[0].translatedText;
			}

			throw new Error(`Google couldn't translate "${text}"`);
		} catch (err: any) {
			// Handle Google API errors
			if (err.code === 8 || err.code === 429) {
				// Resource exhausted (quota exceeded) or rate limited
				throw new RateLimitedError(
					`Google Translate quota exceeded or rate limited: ${err.message}`,
				);
			} else if (err.code === 4) {
				// Deadline exceeded - could be rate limiting
				throw new RateLimitedError(
					`Google Translate deadline exceeded: ${err.message}`,
				);
			}

			throw new Error(
				`Google couldn't translate "${text}": ${err.message || err}`,
			);
		}
	}
}
