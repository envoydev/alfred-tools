// KEPT - no live credential in a file a command line names.
//
// alfred-code's secret guard (v3.2.1 stack/hooks/guard-secret-value.js) refuses a script run that names a JSON file
// holding a live credential, and its Stop guard asks for a rotation once one shows in a tool result. So the files the
// commands hand from one script to the next - inventory, plan, rollback - carry each credential value as MARKER, and
// apply.ts puts the real one back in its own process from the registration it was read from.
//
// Masked whole: every `headers` value; a value under a key the guard's file-key test names (its credKey, :154-156), or
// below one; an arg after a flag that test names (`--api-key <v>`, `--token=<v>`). Masked as that part only, anywhere
// else: a known token shape, a PEM private key, a connection string's `Password=` and a URL's userinfo password. Never
// masked: a value of nothing but ${NAME} / ${NAME:-default} placeholders after at most one scheme word (`Bearer
// ${CONTEXT7_API_KEY}`), and a catalog row's location keys, which configure reads.
import type { Path, RowOf, ServerEntry } from './types.ts';

export const MARKER = '${ALFRED_TOOLS_KEPT}';
// The marker the plugin wrote under its former name (spec D2): a stored list holding it is read as MARKER.
export const OLD_MARKER = '${PREFERRED_TOOLS_KEPT}';

// the guard's tests (v3.2.1 :63-67, :143-156), copied so this file masks at least what it blocks
const SECRET_KEY_RE = /(TOKEN|SECRET|KEY|PASSWORD|PASSWD|DSN|CREDENTIAL|AUTH)$/i;
const FILE_KEY_EXTRA = /(?:^|[._-])pass(?:phrase)?$|(?:^|[._-])(?:client|private)[-_]?key[-_]?data$|^requirepass$/i;
const CAMEL_PASS = /[a-z0-9](?:Pass(?:phrase)?|PWD|Pwd)$/;
export const credKey = (key: string): boolean => SECRET_KEY_RE.test(key) || FILE_KEY_EXTRA.test(key) || CAMEL_PASS.test(key);
const SHAPE = /\b(?:sntryu_[0-9a-f]{16,}|ctx7sk-[0-9a-f-]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g;
const PRIVATE_KEY_BLOCK = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----|$)/g;
const PAIR = /((?:^|[;,])\s*(?:password|pwd)\s*=\s*)([^;,]*)/gi;
const USERINFO = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]*:)([^@\s/]+)(?=@)/gi;
const PLACEHOLDERS = /^\s*(?:[A-Za-z][\w-]*\s+)?(?:\$\{[A-Za-z_][A-Za-z0-9_]*(?::-[^}]*)?\})+\s*$/;

const live = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '' && !PLACEHOLDERS.test(value);
const maskParts = (text: string): string => text.replace(PRIVATE_KEY_BLOCK, MARKER).replace(SHAPE, MARKER)
    .replace(PAIR, (all: string, head: string, value: string) => (live(value) ? head + MARKER : all))
    .replace(USERINFO, (all: string, head: string, value: string) => (live(value) ? head + MARKER : all));
const keepString = (text: string, whole: boolean): string => (!live(text) ? text : whole ? MARKER : maskParts(text));
// `--api-key` -> 'api-key'; a bare value or a lone dash -> null
const flagName = (argument: unknown): string | null => (typeof argument === 'string' && /^--?[A-Za-z]/.test(argument) ? argument.replace(/^--?/, '').split('=')[0]! : null);

function locationKeys(row: RowOf): { env: Set<string>; arg: Set<string> }
{
    const derived = (row && row.locations && row.locations.derived) || [];
    return { env: new Set(derived.filter((derivedLocation) => derivedLocation.in === 'env').map((derivedLocation) => derivedLocation.key)), arg: new Set(derived.filter((derivedLocation) => derivedLocation.in === 'arg').map((derivedLocation) => derivedLocation.key)) };
}

// an argument list: a value after a credential flag is masked whole, one after a location flag never
function keepArgs(args: unknown[], whole: boolean, locArgs: Set<string> = new Set()): unknown[]
{
    return args.map((argument, i) =>
    {
        if (typeof argument !== 'string') return keepNode(argument, '', whole);
        const prev = i > 0 ? args[i - 1] : null;
        if (locArgs.has(prev as string)) return argument;
        const equalsIndex = argument.indexOf('=');
        if (flagName(argument) && equalsIndex > 0)
        {
            const flag = argument.slice(0, equalsIndex);
            if (locArgs.has(flag)) return argument;
            const value = argument.slice(equalsIndex + 1);
            return `${flag}=${keepString(value, whole || credKey(flagName(flag)!))}`;
        }
        if (flagName(argument)) return argument;
        return keepString(argument, whole || Boolean(flagName(prev) && !(prev as string).includes('=') && credKey(flagName(prev)!)));
    });
}

function keepNode(node: unknown, key: string, whole: boolean): unknown
{
    if (typeof node === 'string') return keepString(node, whole || credKey(key));
    if (Array.isArray(node)) return keepArgs(node, whole || credKey(key));
    if (!node || typeof node !== 'object') return node;
    const below = whole || credKey(key);
    return Object.fromEntries(Object.entries(node).map(([childKey, value]) => [childKey, keepNode(value, childKey, below)]));
}

// maskCredentials(entry, row) -> a copy with every credential value as MARKER. `row` is the catalog row the
// registration matched, for its location keys; null for the user's own.
export function maskCredentials<Entry>(entry: Entry, row?: RowOf): Entry
{
    if (!entry || typeof entry !== 'object') return entry;
    const locations = locationKeys(row);
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entry))
    {
        if (key === 'args' && Array.isArray(value)) out['args'] = keepArgs(value, false, locations.arg);
        else if (key === 'headers' && value && typeof value === 'object' && !Array.isArray(value)) out['headers'] = Object.fromEntries(Object.entries(value).map(([headerName, headerValue]) => [headerName, keepNode(headerValue, headerName, true)]));
        else if (key === 'env' && value && typeof value === 'object' && !Array.isArray(value)) out['env'] = Object.fromEntries(Object.entries(value).map(([variableName, variableValue]) => [variableName, locations.env.has(variableName) ? variableValue : keepNode(variableValue, variableName, false)]));
        else out[key] = keepNode(value, key, false);
    }
    return out as Entry;
}

const at = (node: unknown, path: Path): unknown => path.reduce<unknown>((current, segment) => (current == null ? undefined : (current as Record<string | number, unknown>)[segment]), node);

// restore(entry, source, row) -> { entry } | { error }. Each string holding MARKER takes the string at the same place in
// `source` (the registration as it is now) whose kept text equals it; an arg takes the first unused source arg whose
// kept text equals it, in order, so an arg a splice moved still finds its value.
export function restore<Entry>(entry: Entry, source: ServerEntry | null | undefined, row?: RowOf): { entry: Entry; error?: undefined } | { error: string; entry?: undefined }
{
    const kept: { args?: unknown[] | undefined } = maskCredentials(source || {}, row);
    const sourceArgs = Array.isArray(source && source.args) ? source!.args! : [];
    const used = new Set<number>();
    let error: string | null = null;
    const walk = (node: unknown, path: Path): unknown =>
    {
        if (typeof node === 'string')
        {
            if (!node.includes(MARKER)) return node;
            if (path.length === 2 && path[0] === 'args')
            {
                const j = (kept.args || []).findIndex((keptArg, i) => !used.has(i) && keptArg === node);
                if (j < 0) { error = error || `args[${path[1]}] holds a kept value the registration no longer has`; return node; }
                used.add(j);
                return sourceArgs[j];
            }
            if (at(kept, path) !== node) { error = error || `${path.join('.')} holds a kept value the registration no longer has`; return node; }
            return at(source, path);
        }
        if (Array.isArray(node)) return node.map((item, i) => walk(item, [...path, i]));
        if (!node || typeof node !== 'object') return node;
        return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, walk(value, [...path, key])]));
    };
    const out = walk(entry, []) as Entry;
    return error ? { error } : { entry: out };
}

export const holdsKept = (node: unknown): boolean => JSON.stringify(node === undefined ? null : node).includes(MARKER);

// credentialPaths(entry, row) -> the dotted path of every credential value the entry holds, live or already MARKER
// ('headers.X-API-Key', 'args.3', 'url'), for the check that a committed file never gets one.
export function credentialPaths(entry: unknown, row?: RowOf): string[]
{
    const masked = maskCredentials(entry, row);
    const out: string[] = [];
    const walk = (node: unknown, kept: unknown, path: string[]): void =>
    {
        if (typeof node === 'string') { if (node !== kept || node.includes(MARKER)) out.push(path.join('.')); return; }
        if (node && typeof node === 'object') for (const key of Object.keys(node)) walk((node as Record<string, unknown>)[key], kept == null ? undefined : (kept as Record<string, unknown>)[key], [...path, key]);
    };
    walk(entry, masked, []);
    return out;
}

// A value shaped like a known key (SHAPE) or a PEM block - tested in this process, never returned.
export const looksLikeKey = (value: unknown): boolean => new RegExp(SHAPE.source).test(String(value)) || new RegExp(PRIVATE_KEY_BLOCK.source).test(String(value));

