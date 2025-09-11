/**
 * Common interface for all translator implementations
 */
export interface Translator {
	translate(text: string, targetLang: string): Promise<string>;
}