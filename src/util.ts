import { bold } from "ansi-colors";

export function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

export function padRight(text: string, totalLength: number): string {
	return (
		text +
		(text.length < totalLength
			? new Array(totalLength - text.length).join(" ")
			: "")
	);
}

export function error(message: string): void {
	console.error(bold.red(message));
	console.error();
}
