// iobroker prettier configuration file
import prettierConfig from '@iobroker/eslint-config/prettier.config.mjs';

export default {
	...prettierConfig,
	// Keep the same configuration as the original .prettierrc.js for consistency
	semi: true,
	trailingComma: "all",
	singleQuote: false,
	printWidth: 80,
	useTabs: true,
	tabWidth: 4,
	endOfLine: "auto",

	overrides: [
		{
			files: [".github/**/*.yml", "package.json", "lerna.json"],
			options: {
				useTabs: false,
				tabWidth: 2,
				singleQuote: true,
			},
		},
	],
};