// ioBroker eslint template configuration file for js and ts files
// Please note that esm or react based modules need additional modules loaded.
import config from '@iobroker/eslint-config';

export default [
	...config,
	{
		// specify files to exclude from linting here
		ignores: [
			'.dev-server/',
			'.vscode/',
			'*.test.js',
			'test/**/*.js',
			'*.config.mjs',
			'build/**',
			'dist/**',
			'admin/build/**', 
			'admin/words.js',
			'admin/admin.d.ts',
			'admin/blockly.js',
			'**/adapter-config.d.ts',
			'bin/**',
		],
	},
	{
		// you may disable some 'jsdoc' warnings - but using jsdoc is highly recommended
		// as this improves maintainability. jsdoc warnings will not block build process.
		rules: {
			// Keep some rules that were disabled in the original config for compatibility
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/explicit-function-return-type': [
				'warn',
				{
					allowExpressions: true,
					allowTypedFunctionExpressions: true,
				},
			],
			// Disable some jsdoc rules to reduce noise during migration
			'jsdoc/require-param-description': 'off',
			'jsdoc/no-blank-blocks': 'off',
			'jsdoc/require-param': 'off',
			'jsdoc/require-jsdoc': 'off',
			// Disable some strict rules for better compatibility
			'@typescript-eslint/no-floating-promises': 'off',
			'@typescript-eslint/no-redundant-type-constituents': 'off',
		},
	},
	{
		// Special rules for test files
		files: ['*.test.ts', 'test/**/*.ts'],
		rules: {
			'@typescript-eslint/explicit-function-return-type': 'off',
		},
	},
];