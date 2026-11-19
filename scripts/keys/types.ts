// The shapes keys/ reads and hands out: where a key file chain starts, a token field in an entry, and a value found.

// The roots a chain of .mcps-secrets files is built from.
export interface KeyChain
{
    scope: string;
    projectRoot?: string | null | undefined;
    globalRoot?: string | null | undefined;
    globalNamed?: boolean | undefined;
    home: string;
    platform?: string | undefined; // the path form to build the files in; the host's when absent
}

// A token field a catalog route defines and an entry holds: where it is, and the route's form for it.
export interface TokenField
{
    at: ['env' | 'headers', string] | ['args', number];
    template: string;
}

// A value found in a key file, and the file. The value stays in the process that asked.
export interface KeyHit
{
    value: string;
    file: string;
}

// The names each key file holds with a value; every value dropped.
export interface FileNames
{
    file: string;
    names: string[];
}
