// The one JSON reader for every file this plugin parses that a person may have edited (.mcp.json, settings.json, the
// account's .claude.json). An editor on Windows saves UTF-8 with a BOM, and a bare JSON.parse on it throws - which a
// `catch { return {} }` reader turns into 'the file is empty'. One leading BOM is stripped; anything else wrong with the
// text - a BOM plus garbage included - still throws, so it still counts as unreadable.
// Ported from alfred-code scripts/install/json-file.js; blockingStdio is alfred-code stack/hooks/hook-prelude.js's.
import fs from 'node:fs';

export const stripBom = (text: string): string => (typeof text === 'string' && text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text);

// JSON.parse of text that may start with a BOM; throws on anything unparseable.
export const parseJson = (text: string): unknown => JSON.parse(stripBom(text));

// The file's parsed value, or `{}` when it is absent or unreadable.
export const readJson = (file: string): unknown => { try { return parseJson(fs.readFileSync(file, 'utf8')); } catch { return {}; } };

// A pipe closed early must not truncate the last lines of a script's output: make stdout and stderr blocking.
// A stream's libuv handle, which Node's types do not declare.
type HandleOf = { _handle?: { setBlocking?: (blocking: boolean) => void } | null };

export function blockingStdio(streams: NodeJS.WriteStream[] = [process.stdout, process.stderr]): void
{
    for (const stream of streams)
    {
        const typedStream = stream as unknown as HandleOf;
        try { if (typedStream && typedStream._handle && typeof typedStream._handle.setBlocking === 'function') typedStream._handle.setBlocking(true); }
        catch { /* a stream that cannot block keeps Node's default */ }
    }
}

// Two JSON values the same, whatever their key order (moved from plan.js, which re-exports it).
export function sortKeys(value: unknown): unknown
{
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]));
    return value;
}
export const deepEqual = (left: unknown, right: unknown): boolean => JSON.stringify(sortKeys(left)) === JSON.stringify(sortKeys(right));

