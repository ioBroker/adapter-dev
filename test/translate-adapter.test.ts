import { expect } from "chai";
import * as dircompare from "dir-compare";
import { copy, readFileSync } from "fs-extra";
import path from "path";
import { rimraf } from "rimraf";
import {
	handleConvertCommand,
	handleToJsonCommand,
	handleToWordsCommand,
	handleTranslateCommand,
	parseOptions,
} from "../src/translate-adapter-handlers";

async function runTranslation(
	name: string,
	ignoreAdmin: boolean,
	commandHandler: () => Promise<void>,
) {
	const baseDir = path.resolve(__dirname, "data", name);
	const inputDir = path.join(baseDir, "input");
	const outputDir = path.join(baseDir, "output");
	await rimraf(outputDir);
	await copy(inputDir, outputDir);

	const adminDir = path.join(outputDir, "admin");
	await parseOptions({
		"io-package": path.join(outputDir, "io-package.json"),
		admin: adminDir,
		base: ignoreAdmin ? [] : undefined, // don't do admin translations if the directory doesn't exist
	});
	await commandHandler();

	const expectedDir = path.join(baseDir, "expected");
	const result = await dircompare.compare(expectedDir, outputDir, {
		compareContent: true,
		compareFileAsync:
			dircompare.fileCompareHandlers.lineBasedFileCompare.compareAsync,
		ignoreLineEnding: true,
		ignoreEmptyLines: true,
	});

	const differences = result.diffSet
		?.filter((d) => d.state !== "equal")
		.map((d) => {
			switch (d.state) {
				case "left":
					return `- ${path.join(d.relativePath, d.name1 || "")}`;
				case "right":
					return `+ ${path.join(d.relativePath, d.name2 || "")}`;
				default:
					return `! ${path.join(
						d.relativePath,
						d.name1 || d.name2 || "",
					)}`;
			}
		})
		.map((d) => `          ${d}`)
		.join("\n");
	expect(
		result.same,
		`Directories "expected" and "output" are different:\n${differences}`,
	).to.be.true;
}

describe("translate-adapter translate", () => {
	it("translates English to all other languages if they don't exist at all", () => {
		return runTranslation(
			"new-translations",
			false,
			handleTranslateCommand,
		);
	});
	it("translates English to all other languages only if they don't exist already", () => {
		return runTranslation(
			"changing-translations",
			false,
			handleTranslateCommand,
		);
	});
	it("translates io-package.json correctly", () => {
		return runTranslation(
			"translate-io-package",
			true,
			handleTranslateCommand,
		);
	});
	it("adds translations to io-package.json", () => {
		return runTranslation(
			"continue-translate-io-package",
			true,
			handleTranslateCommand,
		);
	});
	it("converts old structure to new one ", async () => {
		const result = await runTranslation(
			"convert-translations",
			true,
			handleConvertCommand,
		);

		// Check that the CR and indentation were set to 4 spaces
		const enFile = readFileSync(
			`${__dirname}/data/convert-translations/output/admin/i18n/en.json`,
			"utf8",
		);

		const keys = Object.keys(JSON.parse(enFile));
		const sortKeys = [...keys].sort();
		expect(JSON.stringify(keys)).to.equal(JSON.stringify(sortKeys));

		return result;
	});
});

describe("translate-adapter to-json", () => {
	it("generates new JSON files if they don't exist", () => {
		return runTranslation("no-json-yet", false, handleToJsonCommand);
	});
	it("updates JSON files if new strings were added to words.js", () => {
		return runTranslation("update-json", false, handleToJsonCommand);
	});
});

describe("translate-adapter to-words", () => {
	it("generates a new words.js if it doesn't exist", () => {
		return runTranslation("no-words-yet", false, handleToWordsCommand);
	});
	it("updates words.js if new strings were added to the JSON files in i18n/<lang>/translations.json", () => {
		return runTranslation("update-words", false, handleToWordsCommand);
	});
	it("updates words.js if new strings were added to the JSON files in i18n/<lang>.json", () => {
		return runTranslation("update-words-v2", false, handleToWordsCommand);
	});
});

describe("translate-adapter all", () => {
	// TODO
});
