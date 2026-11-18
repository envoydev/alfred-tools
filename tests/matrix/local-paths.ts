// The matrix's check for a local absolute path in one field of a committed entry (command, url, headersHelper): what lies
// outside the data folders the entry may name. Pure; the matrix passes the project's own folder and its real path.
const TOKEN_SEPARATOR = /[\s"'=,;]+/;
const DRIVE_ARGUMENT = /^\/[a-z]$/i;
const HOME_PATH = /(?:^|[^$])\/(?:Users|home)\//;

const isUnder = (value: string, root: string): boolean => value === root || value.startsWith(`${root}/`) || value.startsWith(`${root}\\`);

// -> each absolute token not under one of `dataRoots`, and, when a user-home path is left once the roots are removed, the field's
// remaining home paths (a file URL, a path glued to a flag)
export function localPathsOutside(field: string, dataRoots: string[]): string[]
{
    const tokens = field.split(TOKEN_SEPARATOR).filter((token) => (token.startsWith('/') || /^[A-Za-z]:[\\/]/.test(token)) && !DRIVE_ARGUMENT.test(token));
    const outside = tokens.filter((token) => !dataRoots.some((root) => isUnder(token, root)));
    if (outside.length) return outside;
    const rest = dataRoots.reduce((text, root) => text.split(root).join(''), field);
    return HOME_PATH.test(rest) ? [rest] : [];
}

// One registration as the CLI stores it; a field a route has not is absent.
export interface StoredEntry
{
    command?: string;
    url?: string;
    headersHelper?: string;
    args?: string[];
    env?: Record<string, string>;
    headers?: Record<string, string>;
    type?: string;
}

// -> every string a registration holds that can carry a path: the command, the url, the headersHelper, each arg, each env
// value and each header value
export function entryStrings(entry: StoredEntry): string[]
{
    const all = [entry.command, entry.url, entry.headersHelper, ...(entry.args || []), ...Object.values(entry.env || {}), ...Object.values(entry.headers || {})];
    return all.filter((value): value is string => typeof value === 'string');
}
