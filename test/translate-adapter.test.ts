import { expect } from "chai";
import * as dircompare from "dir-compare";
import { copy, readFileSync, existsSync, writeJson } from "fs-extra";
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
	rebuild?: boolean,
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
		rebuild,
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
		?.filter(d => d.state !== "equal")
		.map(d => {
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
		.map(d => `          ${d}`)
		.join("\n");
	expect(
		result.same,
		`Directories "expected" and "output" are different:\n${differences}`,
	).to.be.true;
}

describe("translate-adapter translate", () => {
	it("translates English to all other languages if they don't exist at all", async () => {
		const result = await runTranslation(
			"new-translations",
			false,
			handleTranslateCommand,
		);

		// Check that all generated JSON files have sorted keys
		const deFile = readFileSync(
			`${__dirname}/data/new-translations/output/admin/i18n/de/translations.json`,
			"utf8",
		);
		const deKeys = Object.keys(JSON.parse(deFile));
		const sortedDeKeys = [...deKeys].sort();
		expect(JSON.stringify(deKeys)).to.equal(
			JSON.stringify(sortedDeKeys),
			"German translation keys should be sorted",
		);

		const enDir = `${__dirname}/data/new-translations/input/admin/i18n/en/translations.json`;
		const enFile = readFileSync(enDir, "utf8");
		const enKeys = Object.keys(JSON.parse(enFile));
		// Verify that our test input has intentionally unsorted keys
		expect(enKeys[0]).to.equal(
			"zebra",
			"Test input should start with 'zebra' to verify sorting works",
		);

		return result;
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

	it("rebuilds all translation files when --rebuild is used", async () => {
		// Setup test directory
		const baseDir = path.resolve(__dirname, "data", "rebuild-test");
		const inputDir = path.join(baseDir, "input");
		const outputDir = path.join(baseDir, "output");
		await rimraf(outputDir);
		await copy(inputDir, outputDir);

		const adminDir = path.join(outputDir, "admin");

		// First run normal translation to create files
		await parseOptions({
			"io-package": path.join(outputDir, "io-package.json"),
			admin: adminDir,
		});
		await handleTranslateCommand();

		// Verify files exist
		const deFilePath = path.join(outputDir, "admin", "i18n", "de.json");
		const frFilePath = path.join(outputDir, "admin", "i18n", "fr.json");

		expect(existsSync(deFilePath)).to.be.true;
		expect(existsSync(frFilePath)).to.be.true;

		// Manually modify the German file to have "OLD" content
		const modifiedDeContent = {
			hello: "OLD German",
			world: "OLD World",
			new_key: "OLD New Key",
		};
		await writeJson(deFilePath, modifiedDeContent);

		// Verify the modified content
		const deBefore = JSON.parse(readFileSync(deFilePath, "utf8"));
		expect(deBefore.hello).to.equal("OLD German");
		expect(deBefore.world).to.equal("OLD World");
		expect(deBefore.new_key).to.equal("OLD New Key");

		// Now run with rebuild flag - this should delete and recreate
		await parseOptions({
			"io-package": path.join(outputDir, "io-package.json"),
			admin: adminDir,
			rebuild: true,
		});
		await handleTranslateCommand();

		// Verify files were rebuilt with fresh translations (not the OLD content)
		const deAfter = JSON.parse(readFileSync(deFilePath, "utf8"));
		const frAfter = JSON.parse(readFileSync(frFilePath, "utf8"));

		// Should NOT have the "OLD" content anymore
		expect(deAfter.hello).to.not.equal("OLD German");
		expect(deAfter.world).to.not.equal("OLD World");
		expect(deAfter.new_key).to.not.equal("OLD New Key");

		// Should have all required keys
		expect(deAfter.hello).to.not.be.undefined;
		expect(deAfter.world).to.not.be.undefined;
		expect(deAfter.new_key).to.not.be.undefined;

		expect(frAfter.hello).to.not.be.undefined;
		expect(frAfter.world).to.not.be.undefined;
		expect(frAfter.new_key).to.not.be.undefined;
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

describe("translate-adapter error messages", () => {
	it("provides enhanced error messages for empty string translations", async () => {
		// Use our test data with empty strings
		const baseDir = path.resolve(__dirname, "data", "empty-string-error");
		const inputDir = path.join(baseDir, "input");
		const outputDir = path.join(baseDir, "output");
		await rimraf(outputDir);
		await copy(inputDir, outputDir);

		const adminDir = path.join(outputDir, "admin");
		await parseOptions({
			"io-package": path.join(outputDir, "io-package.json"),
			admin: adminDir,
		});

		// Capture console output to verify error messages
		const originalConsoleError = console.error;
		const errorMessages: string[] = [];
		console.error = (...args: any[]) => {
			const message = args.join(" ");
			errorMessages.push(message);
		};

		try {
			await handleTranslateCommand();
		} finally {
			// Restore console.error
			console.error = originalConsoleError;
		}

		// Check that we got enhanced error messages for empty string keys
		const emptyStringErrors = errorMessages.filter(
			msg =>
				msg &&
				typeof msg === "string" &&
				msg.includes("Empty source text") &&
				(msg.includes("lblOptNoRawStates") ||
					msg.includes("lblOptNoValStates")),
		);

		expect(emptyStringErrors.length).to.be.greaterThan(0);

		// Verify the error message contains key information and helpful text
		const errorWithKey = emptyStringErrors.find(msg =>
			msg.includes("lblOptNoRawStates"),
		);
		expect(errorWithKey).to.include('for key "lblOptNoRawStates"');
		expect(errorWithKey).to.include("Empty source text");
		expect(errorWithKey).to.include(
			"UI can display the key name as fallback",
		);
	});
});
