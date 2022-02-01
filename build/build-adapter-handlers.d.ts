export declare function handleBuildReactCommand(): Promise<void>;
export declare function handleBuildTypeScriptCommand(): Promise<void>;
export declare function handleBuildAllCommand(): Promise<void>;
/******************************** Middlewares *********************************/
export declare function parseOptions(options: {
    watch: boolean;
    reactPattern: string;
    reactTsConfig: string;
    reactBundle: boolean;
    reactFormat?: string;
    reactCompileTarget: string;
    reactRootDir: string;
    reactOutDir: string;
    typescriptPattern: string;
    typescriptTsConfig: string;
    typescriptBundle: boolean;
    typescriptFormat?: string;
    typescriptCompileTarget: string;
    typescriptRootDir: string;
    typescriptOutDir: string;
}): Promise<void>;
