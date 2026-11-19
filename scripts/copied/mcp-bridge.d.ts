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
export declare const RUN_FLAG: '--run';
export interface RunArgs
{
    envVar: string;
    keyName: string;
    optional: boolean;
    globalRoot: string | null;
    command: string;
    args: string[];
}
export interface RunLaunch
{
    command: string;
    args: string[];
    childEnv: Record<string, string | undefined>;
    envVar: string;
    keyName: string;
    keyFile: string | null;
    startName: string;
}
export interface RunError { error: string; code: 1 | 2 }
// The files the run mode reads a key from: .mcps-secrets in `dir`, then in the global root; duplicates dropped.
export declare function runChain(dir: string, globalRoot: string | null): string[];
// The run mode's arguments, as they follow `--run`; no file is read.
export declare function parseRun(argv: readonly string[]): RunArgs | RunError;
// What the run mode starts, read from its arguments and the stdio chain; nothing is started.
export declare function runLaunch(argv: readonly string[], env: Record<string, string | undefined>, options?: { dir?: string; platform?: string; helper?: typeof Helper; exists?: (file: string) => boolean }): RunLaunch | RunError;
