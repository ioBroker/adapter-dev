import { expect } from "chai";
import { DeeplTranslator } from "./deepl-translator";

describe("DeeplTranslator language mapping", () => {
	it("should map 'pt' to 'pt-BR' to avoid DeepL deprecation error", () => {
		const translator = new DeeplTranslator();
		// Access the private method via reflection for testing
		const mapLanguageCode = (translator as any).mapLanguageCode.bind(
			translator,
		);

		// Verify Portuguese mapping
		expect(mapLanguageCode("pt")).to.equal("pt-BR");
	});

	it("should map 'zh-cn' to 'zh'", () => {
		const translator = new DeeplTranslator();
		const mapLanguageCode = (translator as any).mapLanguageCode.bind(
			translator,
		);

		// Verify Chinese mapping
		expect(mapLanguageCode("zh-cn")).to.equal("zh");
	});

	it("should pass through unmapped language codes", () => {
		const translator = new DeeplTranslator();
		const mapLanguageCode = (translator as any).mapLanguageCode.bind(
			translator,
		);

		// Verify other languages pass through unchanged
		expect(mapLanguageCode("de")).to.equal("de");
		expect(mapLanguageCode("fr")).to.equal("fr");
		expect(mapLanguageCode("es")).to.equal("es");
		expect(mapLanguageCode("it")).to.equal("it");
	});
});
