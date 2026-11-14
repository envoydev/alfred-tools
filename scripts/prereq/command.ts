'use strict';
// The prereq command: checks what this machine has and prints it.
const catalogLib = require('../catalog/catalog.ts');
const account = require('../core/account.ts');
const { realMachine } = require('../fix/common.ts');
const { picksFrom, check, render } = require('./prereq.ts');

function main(argv, { env = process.env, machine, platform = process.platform, out = (s) => process.stdout.write(`${s}\n`) } = {})
{
    const catalog = catalogLib.load();
    let picks;
    try { picks = picksFrom(argv, catalog); }
    catch (e) { out(`prereq: ${e.message}`); return 2; }
    if (!picks) { out('usage: prereq.js <answers.json> | --rows id,id  [--json]'); return 2; }
    const unknown = picks.filter((p) => !catalog.byId.has(p.row));
    if (unknown.length) { out(`prereq: unknown tool ${unknown.map((u) => u.row).join(', ')}`); return 2; }
    const ctx = { platform, env, home: account.homeDir(env), machine: machine || realMachine({ env, platform }) };
    const res = check(picks, ctx, catalog, { withAudit: argv.includes('--audit') });
    out(argv.includes('--json') ? JSON.stringify(res, null, 2) : render(res));
    return 0;
}

module.exports = { main };
