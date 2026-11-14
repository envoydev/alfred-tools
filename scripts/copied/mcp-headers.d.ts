// The exported names of mcp-headers.js, which stays CommonJS and is copied into a root byte for byte.
export declare const HELPER_VERSION: number;
// The .mcps-secrets files a folder reads, nearest first: the folder, an extra root, then the two in the home folder.
export declare function chainOf(dir: string, extraRoot: string | null | undefined, home: string): string[];
// SHA-256 of the text with CRLF read as LF, in hex.
export declare function digestOf(text: string): string;
// A dotenv file's names and values; null when it cannot be read.
export declare function readDotenv(file: string): Record<string, string> | null;
// The first non-empty value of a name in the files' order, and the file it came from.
export declare function valueIn(name: string, files: readonly string[]): { value: string; file: string } | null;
// The Authorization value: `<scheme> <value>`, a Basic email:api_token base64-encoded.
export declare function authValue(scheme: string, value: string): string;
