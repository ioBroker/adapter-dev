import { expect } from "chai";
import { escapeRegExp, getIndentation } from "./util";

describe("util/escapeRegExp()", () => {
	it("should escape special regex characters", () => {
		expect(escapeRegExp("hello.world")).to.equal("hello\\.world");
	});
});

describe("util/getIndentation()", () => {
	it("should detect tab indentation", () => {
		const jsonWithTabs = `{
\t"common": {
\t\t"name": "test"
\t}
}`;
		expect(getIndentation(jsonWithTabs)).to.equal("\t");
	});

	it("should detect 2-space indentation", () => {
		const jsonWith2Spaces = `{
  "common": {
    "name": "test"
  }
}`;
		expect(getIndentation(jsonWith2Spaces)).to.equal(2);
	});

	it("should detect 4-space indentation", () => {
		const jsonWith4Spaces = `{
    "common": {
        "name": "test"
    }
}`;
		expect(getIndentation(jsonWith4Spaces)).to.equal(4);
	});

	it("should default to 4 spaces for empty or malformed JSON", () => {
		expect(getIndentation("{}")).to.equal(4);
		expect(getIndentation("")).to.equal(4);
		expect(getIndentation("invalid")).to.equal(4);
	});

	it("should handle JSON with leading empty lines", () => {
		const jsonWithLeadingLines = `

{
\t"common": {
\t\t"name": "test"
\t}
}`;
		expect(getIndentation(jsonWithLeadingLines)).to.equal("\t");
	});

	it("should handle different line endings", () => {
		const jsonWithCRLF =
			'{\r\n\t"common": {\r\n\t\t"name": "test"\r\n\t}\r\n}';
		expect(getIndentation(jsonWithCRLF)).to.equal("\t");
	});
});
