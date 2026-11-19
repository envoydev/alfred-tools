// The shapes core/ reads, writes and hands to every other folder.
import type { CatalogRow } from '../catalog/types.ts';

// A process environment: the variables the scripts read by name, and any other.
export interface Env
{
    HOME?: string | undefined;
    USERPROFILE?: string | undefined;
    CLAUDE_CONFIG_DIR?: string | undefined;
    CLAUDE_PLUGIN_DATA?: string | undefined;
    CLAUDE_PLUGIN_ROOT?: string | undefined;
    PATH?: string | undefined;
    Path?: string | undefined;
    ComSpec?: string | undefined;
    ALFRED_TOOLS_NPM_URL?: string | undefined;
    ALFRED_TOOLS_PYPI_URL?: string | undefined;
    PROCESSOR_ARCHITECTURE?: string | undefined;
    PROCESSOR_ARCHITEW6432?: string | undefined;
    PROCESSOR_IDENTIFIER?: string | undefined;
    SystemDrive?: string | undefined;
    ALFRED_CODE_DATA_PATH?: string | undefined;
    SystemRoot?: string | undefined;
    SYSTEMROOT?: string | undefined;
    windir?: string | undefined;
    MSYSTEM?: string | undefined;
    OSTYPE?: string | undefined;
    CLAUDE_CODE_GIT_BASH_PATH?: string | undefined;
    ProgramFiles?: string | undefined;
    LOCALAPPDATA?: string | undefined;
    ANDROID_HOME?: string | undefined;
    ANDROID_SDK_ROOT?: string | undefined;
    JAVA_HOME?: string | undefined;
    [name: string]: string | undefined;
}

// A JSON value as parsed, before a reader narrows it.
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

// One server as Claude Code stores it in .mcp.json or the account file (stored - do not rename).
export interface ServerEntry
{
    type?: string | undefined; // stored - do not rename
    command?: string | undefined; // stored - do not rename
    args?: string[] | undefined; // stored - do not rename
    env?: (Record<string, string> & { SERENA_HOME?: string; SERENA_USAGE_REPORTING?: string; npm_config_before?: string }) | undefined; // stored - do not rename
    url?: string | undefined; // stored - do not rename
    headers?: (Record<string, string> & { Authorization?: string }) | undefined; // stored - do not rename
    headersHelper?: string | undefined; // stored - do not rename
    [key: string]: Json | undefined;
}
export type ServerMap = Record<string, ServerEntry>;

// The account file (~/.claude.json or $CLAUDE_CONFIG_DIR/.claude.json), the part this plugin reads (stored - do not rename).
export interface AccountProject
{
    mcpServers?: ServerMap | undefined; // stored - do not rename
    hasTrustDialogAccepted?: boolean | undefined; // stored - do not rename
    [key: string]: unknown;
}
export interface AccountFile
{
    mcpServers?: ServerMap | undefined; // stored - do not rename
    projects?: Record<string, AccountProject> | undefined; // stored - do not rename
    [key: string]: unknown;
}
// The account file's top level as readAccount checks it: each project entry is checked only where it is read.
export interface AccountTop
{
    mcpServers?: ServerMap | undefined; // stored - do not rename
    projects?: Record<string, unknown> | undefined; // stored - do not rename
}

// A JSON file read as a state, never a throw.
export type FileState = 'ok' | 'missing' | 'empty' | 'malformed' | 'unreadable';
export interface ReadState<Doc = JsonObject>
{
    file: string;
    state: FileState;
    doc: Doc | null;
    error: string | null;
}
export interface Account extends ReadState<AccountFile>
{
    user: ServerMap;
    local: ServerMap;
    projects: Record<string, AccountProject>;
}

// One run of the claude CLI.
export interface CliOptions
{
    cwd?: string | undefined;
    env?: Env | undefined;
    input?: string | undefined;
    timeout?: number | undefined;
}
export interface CliResult
{
    status: number | null;
    stdout: string;
    stderr: string;
    error: (Error & { code?: string | undefined }) | null;
    signal: NodeJS.Signals | null;
}

// A declined uninstall offer, kept in ${CLAUDE_PLUGIN_DATA}/retired-declined.json (stored - do not rename).
export interface Declined
{
    id: string; // stored - do not rename
    scope: string; // stored - do not rename
}
export interface DeclinedFile
{
    version: number; // stored - do not rename
    declined: Declined[]; // stored - do not rename
}

// What a write reports.
export interface Outcome
{
    ok: boolean;
    detail: string;
}

// The catalog row a registration matched, for its location keys; null for the user's own.
export type RowOf = CatalogRow | null | undefined;
export type Path = (string | number)[];

// A command the machine ran, as spawnSync reports it.
export interface RunResult
{
    status: number | null;
    stdout: string;
    stderr: string;
    error?: Error | undefined;
}
// The only way a detector or a check looks at the machine, so a test replaces it.
export interface MachineProbe
{
    exists(file: string): boolean;
    realpath(file: string): string | null;
    which(name: string): string | null;
    run(command: string, args: string[], options?: { cwd?: string; env?: Env }): RunResult | null;
    nodeVersion: string;
}
