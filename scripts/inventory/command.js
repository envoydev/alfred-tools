'use strict';
// The inventory command: reads its flags, builds the inventory and writes or prints it.
const fs = require('node:fs');
const { blockingStdio } = require('../core/json-file.js');
const { buildInventory, keptOf } = require('./inventory.js');

function main(argv)
{
    blockingStdio();
    const val = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
    const project = val('--project') || process.cwd();
    const outFile = val('--json');
    const inv = buildInventory({ project, data: val('--data') || null });
    if (!inv.cli.ok)
    {
        console.error('preferred-tools: the claude CLI is not on PATH - install Claude Code, then run this again.');
        return 3;
    }
    const text = JSON.stringify(keptOf(inv), null, 2);
    if (outFile) fs.writeFileSync(outFile, text);
    else console.log(text);
    for (const u of inv.unreadable)
        console.error(`preferred-tools: ${u.file} is ${u.state}${u.error ? ` (${u.error})` : ''} - ${u.scope === 'inherited' ? "Claude Code skips that parent folder's servers too; nothing here writes to it." : `the ${u.scope} scope is treated as unreadable and nothing will be written there.`}`);
    const own = inv.registrations.filter((r) => r.own).length;
    console.log(`inventory: ${inv.registrations.length} registrations (${inv.registrations.length - own} match a catalog row, ${own} are your own), ${inv.plugins.length} plugins${outFile ? ` -> ${outFile}` : ''}`);
    return 0;
}

module.exports = { main };
