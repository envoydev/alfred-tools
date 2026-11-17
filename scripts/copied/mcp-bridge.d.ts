// The exported names of mcp-bridge.js, which stays CommonJS and is copied into a root byte for byte.
import type * as Helper from './mcp-headers.js';

export declare const BRIDGE_VERSION: number;
export declare const NEEDS_HELPER: number;
export declare const CREDENTIAL: RegExp;
export interface TemplateName { name: string; optional: boolean }
// The template's variables in order; null for a usage error.
export declare function templateNames(template: unknown): TemplateName[] | null;
// The URL with each variable filled, or the error naming the variable (never the value).
export declare function fillTemplate(template: string, values: Record<string, string | undefined>): { url: string } | { error: string };
export interface Launch
{
    url: string;
    keyName: string;
    keyFile: string;
    names: TemplateName[];
    auth: string;
    command: string;
    args: string[];
    childEnv: Record<string, string | undefined>;
}
// What to start, read from argv (the root, then any `--header NAME=VAR` or `--header NAME:value`) and the .mcps-secrets
// chain; nothing is started.
export declare function launch(argv: readonly string[], env: Record<string, string | undefined>, options?: { dir?: string; platform?: string; helper?: typeof Helper }): Launch | { error: string };
