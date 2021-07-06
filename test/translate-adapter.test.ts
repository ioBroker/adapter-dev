import { expect } from "chai";
import * as dircompare from "dir-compare";
import { copy } from "fs-extra";
import path from "path";
import rimraf from "rimraf";
import { promisify } from "util";
import {
	handleToJsonCommand,
	setDirectories,
} from "../src/translate-adapter-handlers";

async function runTranslation(
	name: string,
	commandHandler: () => Promise<void>,
) {
	const baseDir = path.resolve(__dirname, "data", name);
	const inputDir = path.join(baseDir, "input");
	const outputDir = path.join(baseDir, "output");
	await promisify(rimraf)(outputDir);
	await copy(inputDir, outputDir);

	await setDirectories({
		ioPackage: path.join(outputDir, "io-package.json"),
		admin: path.join(outputDir, "admin"),
	});
	await commandHandler();

	const expectedDir = path.join(baseDir, "expected");
	const result = await dircompare.compare(expectedDir, outputDir, {
		compareFileAsync:
			dircompare.fileCompareHandlers.lineBasedFileCompare.compareAsync,
	});

	if (!result.same) {
		console.log(result);
	}
	expect(result.same, "Directories are not the same").to.be.true;
}

describe("translate-adapter translate", () => {
	// TODO
});

describe("translate-adapter to-json", () => {
	it("generates new JSON files if they don't exist", () => {
		return runTranslation("no-json-yet", handleToJsonCommand);
	});
});

describe("translate-adapter to-words", () => {
	// TODO
});

describe("translate-adapter all", () => {
	// TODO
});
