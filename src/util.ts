import { bold, red } from "ansi-colors";
import { readFile } from "node:fs/promises";

/**
 *
 */
export function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

/**
 *
 */
export function padRight(text: string, totalLength: number): string {
	return text.padEnd(totalLength, " ");
}

/**
 *
 */
export function error(message: string): void {
	console.error(bold.red(message));
	console.error();
}

/**
 *
 */
export function die(message: string): never {
	console.error(red(message));
	process.exit(1);
}

/**
 *
 */
export function getIndentation(text: string): string | number {
	const lines = text.split(/\r?\n/);
	const fileStartLine = lines.findIndex(line => line.startsWith("{"));
	if (fileStartLine !== -1 && lines.length > fileStartLine + 1) {
		// Check for tabs first
		const tabMatches = lines[fileStartLine + 1].match(/^\t+/);
		if (tabMatches && tabMatches.length >= 1) {
			return "\t";
		}

		// Check for spaces
		const spaceMatches = lines[fileStartLine + 1].match(/^[ ]+/);
		if (spaceMatches && spaceMatches.length >= 1) {
			return spaceMatches[0].length;
		}
	}
	return 4;
}

/**
 *
 */
export async function getFileIndentation(
	filePath: string,
): Promise<string | number> {
	try {
		const content = await readFile(filePath, "utf-8");
		return getIndentation(content);
	} catch {
		// If file doesn't exist or can't be read, use default (4 spaces)
		return 4;
	}
}

/**
 *
 */
export function interceptErrors(
	func: () => Promise<void>,
): () => Promise<void> {
	return async () => {
		try {
			await func();
		} catch (error: any) {
			die(error.stack || error);
		}
	};
}
