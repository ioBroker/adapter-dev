import { bold, red } from "ansi-colors";

export function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

export function padRight(text: string, totalLength: number): string {
	return text.padEnd(totalLength, " ");
}

export function error(message: string): void {
	console.error(bold.red(message));
	console.error();
}

export function die(message: string): never {
	console.error(red(message));
	process.exit(1);
}

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
