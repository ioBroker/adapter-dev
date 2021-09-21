module.exports = {
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
