"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseOptions = exports.buildAll = exports.buildTypeScript = exports.buildReact = void 0;
/** Build script to use esbuild without specifying 1000 CLI options */
const estrella_1 = require("@alcalzone/estrella");
const tiny_glob_1 = __importDefault(require("tiny-glob"));
// Build options
let watch;
let reactOptions;
let typescriptOptions;
async function buildReact() {
    let entryPoints = await (0, tiny_glob_1.default)(`${reactOptions.rootDir}/${reactOptions.pattern}`);
    entryPoints = entryPoints.filter((ep) => !ep.endsWith(".d.ts") &&
        !ep.endsWith(".test.ts") &&
        !ep.endsWith(".test.tsx"));
    await (0, estrella_1.build)({
        entryPoints,
        tsconfig: `${reactOptions.rootDir}/${reactOptions.tsConfig}`,
        outdir: `${reactOptions.rootDir}/${reactOptions.outDir}`,
        bundle: reactOptions.bundle,
        format: reactOptions.format,
        target: reactOptions.compileTarget,
        minify: !watch,
        sourcemap: true,
        logLevel: "info",
        define: {
            "process.env.NODE_ENV": watch ? '"development"' : '"production"',
        },
    });
}
exports.buildReact = buildReact;
async function buildTypeScript() {
    let entryPoints = await (0, tiny_glob_1.default)(`${typescriptOptions.rootDir}/${typescriptOptions.pattern}`);
    entryPoints = entryPoints.filter((ep) => !ep.endsWith(".d.ts") && !ep.endsWith(".test.ts"));
    await (0, estrella_1.build)({
        entryPoints,
        tsconfig: `${typescriptOptions.rootDir}/${typescriptOptions.tsConfig}`,
        outdir: `${reactOptions.rootDir}/${reactOptions.outDir}`,
        bundle: typescriptOptions.bundle,
        minify: false,
        sourcemap: true,
        logLevel: "info",
        platform: "node",
        format: typescriptOptions.format,
        target: typescriptOptions.compileTarget, // default: node12
    });
}
exports.buildTypeScript = buildTypeScript;
async function buildAll() {
    await Promise.all([buildReact(), buildTypeScript()]);
}
exports.buildAll = buildAll;
/******************************** Middlewares *********************************/
async function parseOptions(options) {
    watch = options.watch;
    reactOptions = {
        pattern: options.reactPattern,
        tsConfig: options.reactTsConfig,
        bundle: options.reactBundle,
        format: options.reactFormat,
        compileTarget: options.reactCompileTarget,
        rootDir: options.reactRootDir,
        outDir: options.reactOutDir,
    };
    typescriptOptions = {
        pattern: options.typescriptPattern,
        tsConfig: options.typescriptTsConfig,
        bundle: options.typescriptBundle,
        format: options.typescriptFormat,
        compileTarget: options.typescriptCompileTarget,
        rootDir: options.typescriptRootDir,
        outDir: options.typescriptOutDir,
    };
}
exports.parseOptions = parseOptions;
//# sourceMappingURL=build-adapter-handlers.js.map