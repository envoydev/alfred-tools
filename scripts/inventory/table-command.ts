'use strict';
// The table command: reads the inventory file and prints the table.
const fs = require('node:fs');
const { render } = require('./table.ts');

function main(argv, { out = (s) => process.stdout.write(`${s}\n`) } = {})
{
    if (!argv[0]) { out('usage: table.js <inventory.json>'); return 2; }
    let inv;
    try { inv = JSON.parse(fs.readFileSync(argv[0], 'utf8')); }
    catch (e) { out(`table: cannot read ${argv[0]}: ${e.message}`); return 2; }
    out(render(inv));
    return 0;
}

module.exports = { main };
