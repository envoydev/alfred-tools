'use strict';
// THE DECLINED UNINSTALL OFFERS (spec D9, 0.5.0). typescript-lsp, csharp-lsp and claude-hud left the catalog; update and
// fix offer once to uninstall each at each scope it is installed. A decline is kept here, in the plugin's persistent
// folder beside roots.json - `${CLAUDE_PLUGIN_DATA}/retired-declined.json`, `{ version: 1, declined: [{ id, scope }] }` -
// so update offers it no more and fix lists it as advice only. Written through a temporary file.
const fs = require('node:fs');
const path = require('node:path');

const FILE = 'retired-declined.json';
const fileOf = (dataDir) => path.join(dataDir, FILE);
const same = (a, b) => a.id === b.id && a.scope === b.scope;

// -> { declined } | { bad } | null (no file)
function load(dataDir)
{
    let text;
    try { text = fs.readFileSync(fileOf(dataDir), 'utf8'); } catch { return null; }
    try
    {
        const doc = JSON.parse(text);
        if (!doc || !Array.isArray(doc.declined)) return { bad: true };
        return { declined: doc.declined.filter((d) => d && typeof d.id === 'string' && typeof d.scope === 'string').map(({ id, scope }) => ({ id, scope })) };
    }
    catch { return { bad: true }; }
}

// -> [{ id, scope }]; none with no data folder or a file that is not JSON
function read(dataDir)
{
    if (!dataDir) return [];
    const doc = load(dataDir);
    return doc && doc.declined ? doc.declined : [];
}

// -> { ok, detail }
function add(dataDir, items)
{
    if (!dataDir) return { ok: false, detail: 'no plugin data folder given - the decline is not recorded, so the offer comes back next time' };
    const doc = load(dataDir);
    if (doc && doc.bad) return { ok: false, detail: `${fileOf(dataDir)} is not JSON - nothing recorded; fix or delete it` };
    const declined = doc ? doc.declined : [];
    for (const it of items) if (!declined.some((d) => same(d, it))) declined.push({ id: it.id, scope: it.scope });
    fs.mkdirSync(dataDir, { recursive: true });
    const file = fileOf(dataDir);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify({ version: 1, declined }, null, 2)}\n`);
    fs.renameSync(tmp, file);
    return { ok: true, detail: `recorded in ${file}: ${items.map((i) => `${i.id} (${i.scope})`).join(', ')} - not offered again` };
}

// `--input retired-declined=<id>~<scope>,...` -> [{ id, scope }]
function parse(value)
{
    return String(value || '').split(',').filter(Boolean).map((item) =>
    {
        const at = item.lastIndexOf('~');
        if (at < 1 || at === item.length - 1) throw new Error(`retired-declined needs <id>~<scope> items, not '${item}'`);
        return { id: item.slice(0, at), scope: item.slice(at + 1) };
    });
}

module.exports = { FILE, read, add, parse, same };
