// Makes ts-node ignore warnings, so mocha --watch does work
process.env.TS_NODE_IGNORE_WARNINGS = "TRUE";
// Sets the correct tsconfig for testing
process.env.TS_NODE_PROJECT = "tsconfig.json";
// Disables any translation API calls while testing
process.env.TESTING = "true";

// Don't silently swallow unhandled rejections
process.on("unhandledRejection", (e) => {
	throw e;
});

// enable the should interface with sinon
// and load chai-as-promised and sinon-chai by default
const sinonChai = require("sinon-chai");
const { should, use } = require("chai");

should();
use(sinonChai);

// Dynamischer Import für ES-Module
(async () => {
    const chaiAsPromised = await import("chai-as-promised");
    use(chaiAsPromised.default);
})();
