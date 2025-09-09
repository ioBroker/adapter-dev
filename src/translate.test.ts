import { expect } from "chai";
import {
	translateText,
	resetRateLimitState,
	getRateLimitState,
	setRateLimitState,
	clearTranslationCache,
} from "./translate";

describe("translate rate limiting", () => {
	beforeEach(() => {
		// Reset rate limiting state and clear cache before each test
		resetRateLimitState();
		clearTranslationCache();
		// Set test environment to use dummy translations
		process.env.TESTING = "true";
	});

	afterEach(() => {
		delete process.env.TESTING;
	});

	it("should translate normally when not rate limited", async () => {
		const result = await translateText("Hello", "de");
		expect(result).to.include("Mock translation of 'Hello' to 'de'");
	});

	it("should return original text for English", async () => {
		const result = await translateText("Hello", "en");
		expect(result).to.equal("Hello");
	});

	it("should use cache for subsequent calls", async () => {
		// First call
		const result1 = await translateText("Hello", "de");
		expect(result1).to.include("Mock translation of 'Hello' to 'de'");

		// Second call should return same cached result
		const result2 = await translateText("Hello", "de");
		expect(result2).to.equal(result1);
	});

	it("should skip translation when rate limited", async () => {
		// Set rate limiting state
		setRateLimitState(true);

		// Translation should be skipped and return original text
		const result = await translateText("Hello", "de");
		expect(result).to.equal("Hello");
	});

	it("should skip translation when rate limited with retry after", async () => {
		// Set rate limiting state with retry after
		setRateLimitState(true, 60);

		// Translation should be skipped and return original text
		const result = await translateText("Hello", "de");
		expect(result).to.equal("Hello");
	});

	it("should allow translation after rate limit is reset", async () => {
		// Set rate limiting state
		setRateLimitState(true);

		// Translation should be skipped
		const result1 = await translateText("Hello", "de");
		expect(result1).to.equal("Hello");

		// Reset rate limiting
		resetRateLimitState();

		// Translation should work now
		const result2 = await translateText("Hello", "de");
		expect(result2).to.include("Mock translation of 'Hello' to 'de'");
	});

	it("should maintain rate limiting state across multiple calls", async () => {
		// Set rate limiting state
		setRateLimitState(true);

		// Multiple translations should all be skipped
		const result1 = await translateText("Hello", "de");
		const result2 = await translateText("World", "fr");
		const result3 = await translateText("Test", "es");

		expect(result1).to.equal("Hello");
		expect(result2).to.equal("World");
		expect(result3).to.equal("Test");

		// State should still be rate limited
		const state = getRateLimitState();
		expect(state.isRateLimited).to.be.true;
	});

	it("should still return cached translations when rate limited", async () => {
		// First, cache a translation
		const result1 = await translateText("Hello", "de");
		expect(result1).to.include("Mock translation of 'Hello' to 'de'");

		// Now set rate limiting state
		setRateLimitState(true);

		// Cached translation should still work
		const result2 = await translateText("Hello", "de");
		expect(result2).to.equal(result1);

		// But new translation should be skipped
		const result3 = await translateText("World", "de");
		expect(result3).to.equal("World");
	});

	it("should reset state correctly", () => {
		// Set rate limiting state with retry after
		setRateLimitState(true, 120);

		let state = getRateLimitState();
		expect(state.isRateLimited).to.be.true;
		expect(state.rateLimitRetryAfter).to.equal(120);

		// Reset state
		resetRateLimitState();

		state = getRateLimitState();
		expect(state.isRateLimited).to.be.false;
		expect(state.rateLimitRetryAfter).to.be.undefined;
	});
});
