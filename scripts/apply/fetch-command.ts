'use strict';
// The fetch command: runs a fetch file and releases its <tmp>.
const fs = require('node:fs');
const path = require('node:path');
const tmpdir = require('../core/tmpdir.ts');
const { blockingStdio } = require('../core/json-file.ts');
const { VERSION, run } = require('./fetch.ts');

async function main(argv)
{
    blockingStdio();
    const file = argv[0];
    if (!file) { console.error('usage: fetch.js <fetch.json>'); return 2; }
    let j;
    try { j = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { console.error(`fetch: cannot read ${file} (${e.message})`); return 2; }
    if (j.version !== VERSION || !Array.isArray(j.fetch) || !Array.isArray(j.check) || !j.project) { console.error(`fetch: ${file} is not a fetch file of version ${VERSION}`); return 2; }
    const log = (...a) => console.log(a.join('\n'));
    const res = await run(j, { log });
    // the last script on the command's <tmp>: the folder the fetch file sits in goes with it
    tmpdir.release(path.dirname(path.resolve(file)), log);
    return res.warnings.length ? 1 : 0;
}

module.exports = { main };
