// Rebuilds catalog/reserved-names.json from the alfred-code checkout beside this repo (or --alfred <dir>): the names
// alfred-code's retire path may remove a registration under, which no catalog default and no chosen name may use.
//   A = every id in meta/retired-plugins.json whose retiredIn is 2.10.1 (the retires that can still fire)
//   B = every name in meta/stack-manifest.json retired.mcps with no row in retired-plugins.json (today `browser`)
//   reserved = (A + B) - the keys of stack/mcp/original-mcps.json (ADD_BACK_NAMES exempts those)
// `--check` compares instead of writing. Without a checkout the shipped file is the record.
import fs from 'node:fs';
import path from 'node:path';
import { CATALOG_DIR } from './catalog.ts';
import { isRecord } from '../core/shapes.ts';
import { isReservedFile } from './shapes.ts';
import type { AlfredFiles, AlfredRetiredRow } from './types.ts';

const FILE = path.join(CATALOG_DIR, 'reserved-names.json');
const RETIRED_PLUGINS = 'meta/retired-plugins.json';
const STACK_MANIFEST = 'meta/stack-manifest.json';
const ORIGINAL_MCPS = 'stack/mcp/original-mcps.json';

const isText = (value: unknown): value is string => typeof value === 'string';
const isRetiredRow = (value: unknown): value is AlfredRetiredRow => isRecord(value) && [value['id'], value['name'], value['retiredIn']].every((field) => field === undefined || isText(field));

// alfred-code's three files, each read and checked for the part used here, or the problem with the first that is not
// what alfred-code writes - a checkout of another version, or a file cut short.
export function readAlfredFiles(alfredDir: string): { files: AlfredFiles } | { problem: string }
{
    const read = (rel: string): { value: unknown } | { problem: string } =>
    {
        try { return { value: JSON.parse(fs.readFileSync(path.join(alfredDir, rel), 'utf8')) }; }
        catch (caught) { return { problem: `${rel} cannot be read as JSON (${caught instanceof Error ? caught.message : String(caught)})` }; }
    };
    const retired = read(RETIRED_PLUGINS);
    if ('problem' in retired) return retired;
    const plugins = isRecord(retired.value) ? retired.value['plugins'] : undefined;
    const rows = Array.isArray(plugins) ? plugins : isRecord(plugins) ? Object.entries(plugins).map(([id, row]) => (isRecord(row) ? { id, ...row } : row)) : null;
    if (!rows || !rows.every(isRetiredRow)) return { problem: `${RETIRED_PLUGINS} has no plugins list of { id, name, retiredIn } rows` };
    const manifest = read(STACK_MANIFEST);
    if ('problem' in manifest) return manifest;
    const retiredPart = isRecord(manifest.value) ? manifest.value['retired'] : undefined;
    const mcps = isRecord(retiredPart) ? (retiredPart['mcps'] || []) : undefined;
    if (!Array.isArray(mcps) || !mcps.every(isText)) return { problem: `${STACK_MANIFEST} has no retired object with an mcps list of names` };
    const original = read(ORIGINAL_MCPS);
    if ('problem' in original) return original;
    const servers = isRecord(original.value) ? original.value['mcpServers'] : undefined;
    if (!isRecord(servers)) return { problem: `${ORIGINAL_MCPS} has no mcpServers object` };
    return { files: { rows, retiredMcps: mcps, originalNames: Object.keys(servers) } };
}

// The reserved names alfred-code's files give, sorted.
export function reservedNamesOf(files: AlfredFiles): string[]
{
    const ids = new Set(files.rows.map((row) => row.id || row.name));
    const retiredIds = files.rows.filter((row) => row.retiredIn === '2.10.1').map((row) => row.id || row.name).filter(isText);
    const retiredMcpNames = files.retiredMcps.filter((name) => !ids.has(name));
    const original = new Set(files.originalNames);
    return [...new Set([...retiredIds, ...retiredMcpNames])].filter((name) => !original.has(name)).sort();
}

// The reserved names of the checkout at `alfredDir`; a file that is not what alfred-code writes throws, naming it.
export function reservedFrom(alfredDir: string): string[]
{
    const read = readAlfredFiles(alfredDir);
    if ('problem' in read) throw new Error(`refresh-reserved: ${read.problem}`);
    return reservedNamesOf(read.files);
}

export function runRefreshReservedCommand(argv: string[]): number
{
    const at = argv.indexOf('--alfred');
    const named = at >= 0 ? argv[at + 1] : undefined;
    if (at >= 0 && named === undefined)
    {
        console.error('refresh-reserved: --alfred needs the folder of an alfred-code checkout');
        return 2;
    }
    const alfred = path.resolve(named ?? path.join(import.meta.dirname, '..', '..', '..', 'alfred-code'));
    if (!fs.existsSync(path.join(alfred, 'meta', 'retired-plugins.json')))
    {
        console.error(`refresh-reserved: no alfred-code checkout at ${alfred}`);
        return 2;
    }
    const read = readAlfredFiles(alfred);
    if ('problem' in read)
    {
        console.error(`refresh-reserved: ${read.problem}`);
        return 2;
    }
    const names = reservedNamesOf(read.files);
    if (argv.includes('--check'))
    {
        const file: unknown = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        if (!isReservedFile(file)) { console.error(`refresh-reserved: ${FILE} has no names list - nothing compared`); return 2; }
        const have = file.names;
        const same = JSON.stringify(have) === JSON.stringify(names);
        console.log(same ? 'reserved-names.json matches alfred-code' : `reserved-names.json differs from alfred-code:\n  file ${have}\n  now  ${names}`);
        return same ? 0 : 1;
    }
    const doc = { note: 'Names alfred-code once registered and may retire. Built by scripts/refresh-reserved.ts; do not hand-edit.', names };
    fs.writeFileSync(FILE, JSON.stringify(doc, null, 2) + '\n');
    console.log(`wrote ${names.length} names`);
    return 0;
}

