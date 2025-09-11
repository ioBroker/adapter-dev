import type { Translator } from "./types";

/**
 * @see Translator implementation that is used for testing.
 * It returns a mock text.
 */
export class TestingTranslator implements Translator {
	translate(text: string, targetLang: string): Promise<string> {
		return Promise.resolve(
			`Mock translation of '${text}' to '${targetLang}'`,
		);
	}
}