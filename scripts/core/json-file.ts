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
        const s = stream as unknown as HandleOf;
        try { if (s && s._handle && typeof s._handle.setBlocking === 'function') s._handle.setBlocking(true); }
        catch { /* a stream that cannot block keeps Node's default */ }
    }
}

// Two JSON values the same, whatever their key order (moved from plan.js, which re-exports it).
export function sortKeys(v: unknown): unknown
{
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]));
    return v;
}
export const deepEqual = (a: unknown, b: unknown): boolean => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

