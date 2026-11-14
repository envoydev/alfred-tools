'use strict';
// The plan command: reads its files and flags, prints the plan or the questions, and writes the plan file.
const fs = require('node:fs');
const catalogLib = require('../catalog/catalog.js');
const { all } = require('./asks-all.js');
const { next } = require('./walk.js');
const account = require('../core/account.js');
const roots = require('../roots/roots.js');
const existing = require('../inventory/existing.js');
const { blockingStdio } = require('../core/json-file.js');
const { plan } = require('./plan.js');
const { render } = require('./render.js');

// The arguments, by flag: `--questions` first or not at all, then at most two files, and the flags anywhere after them.
// An unknown flag, or a flag without its value, is an error - never read as a file.
const VALUE_FLAGS = { '--data': 'data', '--connectors': 'connectors', '--out': 'out' };
function parseArgs(argv)
{
    const out = { questions: argv[0] === '--questions', files: [], data: null, connectors: null, out: null, error: null };
    for (let i = out.questions ? 1 : 0; i < argv.length; i++)
    {
        const a = argv[i];
        if (Object.hasOwn(VALUE_FLAGS, a))
        {
            if (i + 1 >= argv.length) return { ...out, error: `${a} needs a value` };
            out[VALUE_FLAGS[a]] = argv[++i];
        }
        else if (a.startsWith('--')) return { ...out, error: `unknown flag '${a}'` };
        else out.files.push(a);
    }
    if (out.files.length > 2) return { ...out, error: `one inventory file and one ${out.questions ? 'picks' : 'answers'} file, not ${out.files.length} files` };
    return out;
}

const USAGE = 'usage: plan.js <inventory.json> <answers.json> [--out plan.json] [--data <dir>]\n       plan.js --questions <inventory.json> [<picks.json>] [--data <dir>] [--connectors <Name>,<Name>]';

function main(argv)
{
    blockingStdio();
    const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
    const args = parseArgs(argv);
    if (args.error) { console.error(`plan.js: ${args.error}\n${USAGE}`); return 2; }
    const [invFile, second] = args.files;
    if (!invFile || (!args.questions && !second)) { console.error(USAGE); return 2; }
    const inv = read(invFile);
    // the roots map is read fresh from the plugin's data folder when one is given
    if (args.data !== null) inv.roots = { ...(inv.roots || {}), map: roots.readMap(args.data) };
    if (args.questions)
    {
        const picks = second ? read(second) : null;
        const catalog = catalogLib.load();
        // --connectors: the claude.ai connectors this session has loaded, named in the pick list (spec F4)
        const qopts = { env: process.env, home: account.homeDir(process.env), connectors: args.connectors !== null ? existing.parseConnectors(args.connectors) : null };
        const built = all(inv, picks, catalog, qopts);
        // the walk's one step: what to ask now, about one tool (spec F1)
        const q = { ...built, next: next(inv, picks, catalog, qopts, built) };
        console.log(JSON.stringify(q, null, 2));
        return 0;
    }
    const p = plan(inv, read(second), { env: process.env, connectors: args.connectors !== null ? existing.parseConnectors(args.connectors) : null });
    if (args.out) fs.writeFileSync(args.out, JSON.stringify(p, null, 2));
    console.log(render(p));
    return p.errors.length ? 1 : 0;
}

module.exports = { main, parseArgs };
