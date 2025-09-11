import axios, { type AxiosRequestConfig } from "axios";
import { applyHttpsProxy, getRequestTimeout } from "../network";
import type { Translator } from "./types";

/**
 * @see Translator implementation that uses the old Google Translation API.
 * This API is rate limited and the user will see an error if too many
 * translation requests are done within a given timespan.
 */
export class LegacyTranslator implements Translator {
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