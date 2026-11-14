// @ts-nocheck - typed in Task 12
// The fix command: reads its flags and runs the detectors, the asks or the fixes.
import path from 'node:path';
import * as inventory from '../inventory/inventory.ts';
import * as tmpdir from '../core/tmpdir.ts';
import { makeCtx, applyFixes, detectAll, questions, render } from './fix.ts';

// ---- CLI ------------------------------------------------------------------------------------------------------------

export function parseArgs(argv)
{
    const args = { input: {} };
    const value = (i, flag) =>
    {
        const v = argv[i + 1];
        if (v === undefined || v === '' || v.startsWith('--')) throw new Error(`${flag} needs a value`);
        return v;
    };
    for (let i = 0; i < argv.length; i++)
    {
        const a = argv[i];
        if (['--detect', '--questions', '--json'].includes(a)) { args[a.slice(2)] = true; continue; }
        if (!['--apply', '--only', '--input', '--project', '--tmp', '--data'].includes(a)) throw new Error(`unknown argument '${a}'`);
        const v = value(i, a);
        i++;
        if (a === '--input')
        {
            const eq = v.indexOf('=');
            if (eq < 1) throw new Error('--input needs key=value');
            args.input[v.slice(0, eq)] = v.slice(eq + 1);
        }
        else
        {
            if (Object.hasOwn(args, a.slice(2))) throw new Error(`${a} is given twice`);
            args[a.slice(2)] = v;
        }
    }
    const modes = ['detect', 'questions', 'apply'].filter((m) => args[m]);
    if (modes.length !== 1) throw new Error('give exactly one of --detect, --questions or --apply');
    return args;
}

export function main(argv, { env = process.env, out = (s) => process.stdout.write(`${s}\n`), machine } = {})
{
    let args;
    try { args = parseArgs(argv); }
    catch (e) { out(`fix: ${e.message}\nusage: node scripts/fix.ts --detect | --questions | --apply <id,id|all> [--only <x>] [--input key=value] [--project <dir>] [--data <dir>]`); return 2; }
    const project = path.resolve(args.project || process.cwd());
    const data = args.data || null;
    const inv = inventory.buildInventory({ project, env, data });
    if (!inv.cli.ok) { out('preferred-tools: the claude CLI is not on PATH - install Claude Code, then run this again.'); return 3; }
    const ctx = makeCtx({ inv, env, machine, data });
    if (args.apply)
    {
        const log = (...a) => out(a.join('\n'));
        const res = applyFixes(ctx, args.apply.split(',').filter(Boolean), { only: args.only, input: args.input, tmp: args.tmp, log });
        // the last script on <tmp> removes it, unless fetch.js takes it on
        if (!res.fetchFile) tmpdir.release(res.tmp, log);
        return res.failed ? 1 : 0;
    }
    const detected = detectAll(ctx, { only: args.only });
    if (args.questions) out(JSON.stringify(questions(detected), null, 2));
    else out(args.json ? JSON.stringify(detected, null, 2) : render(detected));
    return 0;
}

