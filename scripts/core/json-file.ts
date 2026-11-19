// The one JSON reader for every file this plugin parses that a person may have edited (.mcp.json, settings.json, the
// account's .claude.json). An editor on Windows saves UTF-8 with a BOM, and a bare JSON.parse on it throws - which a
// `catch { return {} }` reader turns into 'the file is empty'. One leading BOM is stripped; anything else wrong with the
// text - a BOM plus garbage included - still throws, so it still counts as unreadable.
// Ported from alfred-code scripts/install/json-file.js; blockingStdio is alfred-code stack/hooks/hook-prelude.js's.
import { isRecord } from './guards.ts';

export const stripBom = (text: string): string => (typeof text === 'string' && text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text);

// JSON.parse of text that may start with a BOM; throws on anything unparseable.
export const parseJson = (text: string): unknown => JSON.parse(stripBom(text));

// A pipe closed early must not truncate the last lines of a script's output: make stdout and stderr blocking.
export function blockingStdio(streams: NodeJS.WriteStream[] = [process.stdout, process.stderr]): void
{
    for (const stream of streams)
    {
        try
        {
            // a stream's libuv handle, which Node's types do not declare
            const handle: unknown = stream && '_handle' in stream ? stream._handle : null;
            if (isRecord(handle) && typeof handle['setBlocking'] === 'function') handle['setBlocking'](true);
        }
        catch { /* a stream that cannot block keeps Node's default */ }
    }
}

// Two JSON values the same, whatever their key order: each compared with every object's keys sorted.
function sortKeys(value: unknown): unknown
{
    if (Array.isArray(value)) return value.map(sortKeys);
    if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
    return value;
}
// A JSON value copied through its text: no object of the copy is shared with the original.
export const clone = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value));

export const deepEqual = (left: unknown, right: unknown): boolean => JSON.stringify(sortKeys(left)) === JSON.stringify(sortKeys(right));

