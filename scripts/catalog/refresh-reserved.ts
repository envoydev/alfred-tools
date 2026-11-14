#!/usr/bin/env node
// Rebuilds catalog/reserved-names.json from the alfred-code checkout beside this repo (or --alfred <dir>): the names
// alfred-code's retire path may remove a registration under, which no catalog default and no chosen name may use.
//   A = every id in meta/retired-plugins.json whose retiredIn is 2.10.1 (the retires that can still fire)
//   B = every name in meta/stack-manifest.json retired.mcps with no row in retired-plugins.json (today `browser`)
//   reserved = (A + B) - the keys of stack/mcp/original-mcps.json (ADD_BACK_NAMES exempts those)
// `--check` compares instead of writing. Without a checkout the shipped file is the record.
import fs from 'node:fs';
import path from 'node:path';
import type { AlfredFiles, ReservedFile, RetiredRow } from './types.ts';

const FILE = path.join(import.meta.dirname, '..', '..', 'catalog', 'reserved-names.json');

export function reservedFrom(alfredDir: string): string[]
{
    const read = (rel: string): AlfredFiles => JSON.parse(fs.readFileSync(path.join(alfredDir, rel), 'utf8')) as AlfredFiles;
    const retired = read('meta/retired-plugins.json').plugins;
    const rows: RetiredRow[] = Array.isArray(retired) ? retired : Object.entries(retired).map(([id, retiredRow]) => ({ id, ...retiredRow }));
    const ids = new Set(rows.map((row) => row.id || row.name));
    const retiredIds = rows.filter((row) => row.retiredIn === '2.10.1').map((row) => (row.id || row.name)!);
    const retiredMcpNames = (read('meta/stack-manifest.json').retired.mcps || []).filter((name) => !ids.has(name));
    const original = new Set(Object.keys(read('stack/mcp/original-mcps.json').mcpServers));
    return [...new Set([...retiredIds, ...retiredMcpNames])].filter((name) => !original.has(name)).sort();
}

export function runRefreshReservedCommand(argv: string[]): number
{
    const at = argv.indexOf('--alfred');
    const alfred = path.resolve(at >= 0 ? argv[at + 1]! : path.join(import.meta.dirname, '..', '..', '..', 'alfred-code'));
    if (!fs.existsSync(path.join(alfred, 'meta', 'retired-plugins.json')))
    {
        console.error(`refresh-reserved: no alfred-code checkout at ${alfred}`);
        return 2;
    }
    const names = reservedFrom(alfred);
    if (argv.includes('--check'))
    {
        const have = (JSON.parse(fs.readFileSync(FILE, 'utf8')) as ReservedFile).names;
        const same = JSON.stringify(have) === JSON.stringify(names);
        console.log(same ? 'reserved-names.json matches alfred-code' : `reserved-names.json differs from alfred-code:\n  file ${have}\n  now  ${names}`);
        return same ? 0 : 1;
    }
    const doc = { note: 'Names alfred-code once registered and may retire. Built by scripts/refresh-reserved.ts; do not hand-edit.', names };
    fs.writeFileSync(FILE, JSON.stringify(doc, null, 2) + '\n');
    console.log(`wrote ${names.length} names`);
    return 0;
}

