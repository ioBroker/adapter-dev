export declare function die(message: string): never;
/******************************** Middlewares *********************************/
export declare function setDirectories(options: {
    ioPackage: string;
    admin: string;
    words?: string;
    base?: string[];
}): Promise<void>;
/***************************** Command Handlers *******************************/
export declare function handleTranslateCommand(): Promise<void>;
export declare function handleToJsonCommand(): Promise<void>;
export declare function handleToWordsCommand(): Promise<void>;
export declare function handleAllCommand(): Promise<void>;
