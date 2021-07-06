import { bold } from "ansi-colors";

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
