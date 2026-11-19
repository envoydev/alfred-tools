// The shapes entries/ builds and reads: a logical root, the machine a registration is built for, an installed
// registration and the answers read back from it, the parts of a helper or bridge launch, and a fetch step.
import type { Env, ServerEntry } from '../core/types.ts';
import type { Catalog } from '../catalog/types.ts';

// A root before it is written: under the project, under the account home, or an absolute path.
export type Root = { kind: 'project'; rel: string } | { kind: 'home'; rel: string } | { kind: 'abs'; path: string };
// A root written as an absolute path: serena's home on Windows is one.
export type AbsRoot = Extract<Root, { kind: 'abs' }>;

// The two scope families' root folders, once the plan or the questions resolved them.
export interface Roots
{
    project?: string | null | undefined;
    global?: string | null | undefined;
    globalNamed?: boolean | undefined;
    projectNamed?: boolean | undefined;
}

// The machine a registration is built for. Nothing in entries/ reads a machine itself.
export interface Machine
{
    platform: string;
    project: string;
    home: string;
    arch?: string | undefined;
    env?: Env | undefined;
    roots?: Roots | null | undefined;
    knownRoots?: string[] | undefined; // every root folder a --config may name as the plugin's: the resolved ones and those in use
    machine?: { docker?: boolean | undefined } | null | undefined;
    exists?: ((file: string) => boolean) | undefined;
    isDir?: ((file: string) => boolean) | undefined;
    catalog?: Catalog | undefined;
}

// What the --config test reads of a machine: where the roots are, and which roots are known.
export type RootsView = Pick<Machine, 'platform' | 'project' | 'home' | 'roots' | 'knownRoots'>;

// An installed registration, as the inventory reads it.
export interface Registration
{
    name: string;
    scope: string;
    route?: string | null | undefined;
    entry: ServerEntry;
}

// The installed registration's own answers, read back from its entry.
export interface Current
{
    name: string;
    scope: string;
    route: string | null | undefined;
    entry: ServerEntry;
    rootStr: string | null;
    executablePath: string | undefined;
    token: boolean;
    keyName: string | null;
    urlNames?: Record<string, string>;
    host: string | null;
}

// The answers a fresh entry is built from.
export interface BuildAnswers
{
    scope: string;
    rootStr?: string | undefined;
    executablePath?: string | null | undefined;
    token?: boolean | undefined;
    keyName?: string | null | undefined;
    params?: Record<string, string | undefined> | undefined;
    urlNames?: Record<string, string> | undefined;
    settings?: Record<string, string> | undefined;
    exclude?: boolean | undefined;
}

// A `headersHelper` command's helper file, the arguments after it, and those read as the helper reads them: the global
// root and the `--header` pairs (`NAME=VAR` or `NAME:value`).
export interface HelperParts
{
    path: string;
    args: string[];
    root: string | null;
    pairs: string[];
}

// A bridge launch: `node <path>/mcp-bridge.js <template> <KEY> <SCHEME> <pkg> [<root>] [--header <pair>]...`; `pairs` are
// the `--header` pairs, each as its text.
export interface BridgeParts
{
    path: string;
    template: string;
    keyName: string | null;
    scheme: string | null;
    packageSpec: string | null;
    globalRoot: string | null;
    pairs: string[];
}

// The shared sign-in form's URL, its folder and the mcp-remote pin.
export interface SignInParts
{
    url: string;
    dir: string;
    pin: string;
}

// A plan step that fetches what a written registration launches into the runtime's cache.
export interface FetchStep
{
    op: 'fetch';
    name: string;
    row: string | null | undefined;
    what: string;
    argv: string[];
    env: Record<string, string>;
    why: string;
}

// A row's default data folder: a root (and alfred-code's, when on disk), or a question to put.
export type DefaultRoot = { root: Root; alfred?: Root; needsInput?: undefined } | { needsInput: string; root?: undefined; alfred?: undefined };
