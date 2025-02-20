import { bold, red } from 'ansi-colors';

export function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

export function padRight(text: string, totalLength: number): string {
    return text.padEnd(totalLength, ' ');
}

export function error(message: string): void {
    console.error(bold.red(message));
    console.error();
}

export function die(message: string): never {
    console.error(red(message));
    process.exit(1);
}

export function getIndentation(text: string): number {
    const lines = text.split(/\r?\n/);
    const fileStartLine = lines.findIndex(line => line.startsWith('{'));
    if (fileStartLine !== -1 && lines.length > fileStartLine) {
        const matches = lines[fileStartLine + 1].match(/^[ ]+/);
        console.log(matches);
        if (matches && matches.length >= 1) {
            return matches[0].length;
        }
    }
    return 4;
}

export function interceptErrors(func: () => Promise<void>): () => Promise<void> {
    return async () => {
        try {
            await func();
        } catch (error: any) {
            die(error.stack || error);
        }
    };
}
