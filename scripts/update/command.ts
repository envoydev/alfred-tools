'use strict';
// The update command: reads its flags and runs the check, the asks or the apply.
const path = require('node:path');
const inventory = require('../inventory/inventory.ts');
const cli = require('../core/claude-cli.ts');
const tmpdir = require('../core/tmpdir.ts');
const { makeCtx, check, render } = require('./check.ts');
const { questions } = require('./asks.ts');
const { applyUpdates } = require('./apply.ts');

// ---- CLI -------------------------------------------------------------------------------------------------------------

function parseArgs(argv)
{
    const args = { input: {} };
    for (let i = 0; i < argv.length; i++)
    {
        const a = argv[i];
        if (['--check', '--questions', '--json', '--no-refresh'].includes(a)) { args[a.slice(2)] = true; continue; }
        if (!['--apply', '--project', '--tmp', '--data', '--input'].includes(a)) throw new Error(`unknown argument '${a}'`);
        const v = argv[i + 1];
        if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
        i++;
        // fix.js's rule: split on the first =, repeatable
        if (a === '--input')
        {
            const eq = v.indexOf('=');
            if (eq < 1) throw new Error('--input needs key=value');
            args.input[v.slice(0, eq)] = v.slice(eq + 1);
            continue;
        }
        if (Object.hasOwn(args, a.slice(2))) throw new Error(`${a} is given twice`);
        args[a.slice(2)] = v;
    }
    if (['check', 'questions', 'apply'].filter((m) => args[m]).length !== 1) throw new Error('give exactly one of --check, --questions or --apply');
    return args;
}

async function main(argv, { env = process.env, out = (s) => process.stdout.write(`${s}\n`), machine, registry, now, runCli } = {})
{
    let args;
    try { args = parseArgs(argv); }
    catch (e) { out(`update: ${e.message}\nusage: node scripts/update.ts --check | --questions | --apply <id,id|all|none> [--input key=value] [--no-refresh] [--project <dir>] [--tmp <dir>] [--data <dir>]`); return 2; }
    const project = path.resolve(args.project || process.cwd());
    const inv = inventory.buildInventory({ project, env, run: runCli || cli.run, data: args.data || null });
    if (!inv.cli.ok) { out('preferred-tools: the claude CLI is not on PATH - install Claude Code, then run this again.'); return 3; }
    const ctx = makeCtx({ inv, project, env, machine, registry, now, runCli: runCli || cli.run, refresh: !args['no-refresh'], data: args.data || null });
    const found = await check(ctx);
    if (args.apply)
    {
        const log = (...a) => out(a.join('\n'));
        const res = applyUpdates(ctx, args.apply.split(',').filter(Boolean), found, { tmp: args.tmp, log, input: args.input });
        // the last script on <tmp> removes it, unless fetch.js takes it on; apply() per server never does
        if (!res.fetchFile) tmpdir.release(res.dir, log);
        return res.failed.length || res.unknown.length ? 1 : 0;
    }
    if (args.questions) out(JSON.stringify(questions(found), null, 2));
    else if (args.json) out(JSON.stringify(found, null, 2));
    else out(render(found));
    return 0;
}

module.exports = { parseArgs, main };
