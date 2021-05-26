import axios from "axios";

/**
 * Translates text using the Google Translate API
 * @param text The text to translate
 * @param targetLang The target languate
 */
export async function translateText(
	text: string,
	targetLang: string,
): Promise<string> {
	if (targetLang === "en") {
		return text;
	} else if (!text) {
		return "";
	}
	return translateGoogle(text, targetLang);
}

/**
 * Translates text with Google API
 * @param text The text to translate
 * @param targetLang The target languate
 */
export async function translateGoogle(
	text: string,
	targetLang: string,
): Promise<string> {
	try {
		const url = `http://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(
			text,
		)}&ie=UTF-8&oe=UTF-8`;
		const response = await axios({ url, timeout: 15000 });
		if (Array.isArray(response.data)) {
			// we got a valid response
			return response.data[0][0][0];
		}
		throw new Error("Invalid response for translate request");
	} catch (e) {
		if (e.response?.status === 429) {
			throw new Error(
				`Could not translate to "${targetLang}": Rate-limited by Google Translate`,
			);
		} else {
			throw new Error(`Could not translate to "${targetLang}": ${e}`);
		}
	}
}
