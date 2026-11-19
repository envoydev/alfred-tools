// THE DECLINED UNINSTALL OFFERS (spec D9, 0.5.0). typescript-lsp, csharp-lsp and claude-hud left the catalog; update and
// fix offer once to uninstall each at each scope it is installed. A decline is kept here, in the plugin's persistent
// folder beside roots.json - `${CLAUDE_PLUGIN_DATA}/retired-declined.json`, `{ version: 1, declined: [{ id, scope }] }` -
// so update offers it no more and fix lists it as advice only. Written through a temporary file.
import fs from 'node:fs';
import path from 'node:path';
import { replaceFile } from './replace-file.ts';
import { parseJson } from './json-file.ts';
import { errorCode, isRecord } from './guards.ts';
import type { Declined, DeclinedFile, Outcome } from './types.ts';

const FILE = 'retired-declined.json';
const fileOf = (dataDir: string): string => path.join(dataDir, FILE);
export const same = (first: Declined, second: Declined): boolean => first.id === second.id && first.scope === second.scope;
const isDeclined = (entry: unknown): entry is Declined => isRecord(entry) && typeof entry['id'] === 'string' && typeof entry['scope'] === 'string';

// -> { declined } | { bad } | null (no file)
function load(dataDir: string): { declined: Declined[]; bad?: undefined } | { bad: true; declined?: undefined } | null
{
    let text: string;
    try { text = fs.readFileSync(fileOf(dataDir), 'utf8'); }
    // only a file that is not there is no file: one that cannot be read is never replaced by a fresh one
    catch (caught) { return errorCode(caught) === 'ENOENT' ? null : { bad: true }; }
    try
    {
        const doc = parseJson(text);
        const declined: unknown = isRecord(doc) ? doc['declined'] : undefined;
        if (!Array.isArray(declined)) return { bad: true };
        return { declined: declined.filter(isDeclined).map(({ id, scope }) => ({ id, scope })) };
    }
    catch { return { bad: true }; }
}

// -> [{ id, scope }]; none with no data folder, or a file that cannot be read or is not JSON
export function read(dataDir: string | null | undefined): Declined[]
{
    if (!dataDir) return [];
    const doc = load(dataDir);
    return doc && doc.declined ? doc.declined : [];
}

// -> { ok, detail }
export function add(dataDir: string | null | undefined, items: Declined[]): Outcome
{
    if (!dataDir) return { ok: false, detail: 'no plugin data folder given - the decline is not recorded, so the offer comes back next time' };
    const doc = load(dataDir);
    if (doc && doc.bad) return { ok: false, detail: `${fileOf(dataDir)} cannot be read or is not JSON - nothing recorded; fix or delete it` };
    const declined = doc ? doc.declined : [];
    for (const it of items) if (!declined.some((entry) => same(entry, it))) declined.push({ id: it.id, scope: it.scope });
    fs.mkdirSync(dataDir, { recursive: true });
    const file = fileOf(dataDir);
    replaceFile(file, `${JSON.stringify({ version: 1, declined } satisfies DeclinedFile, null, 2)}\n`);
    return { ok: true, detail: `recorded in ${file}: ${items.map((item) => `${item.id} (${item.scope})`).join(', ')} - not offered again` };
}

// `--input retired-declined=<id>~<scope>,...` -> [{ id, scope }]
export function parse(value: string | null | undefined): Declined[]
{
    return String(value || '').split(',').filter(Boolean).map((item) =>
    {
        const at = item.lastIndexOf('~');
        if (at < 1 || at === item.length - 1) throw new Error(`retired-declined needs <id>~<scope> items, not '${item}'`);
        return { id: item.slice(0, at), scope: item.slice(at + 1) };
    });
}

