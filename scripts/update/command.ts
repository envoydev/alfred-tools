// The update command: reads its flags and runs the check, the asks or the apply.
import path from 'node:path';
import * as inventory from '../inventory/inventory.ts';
import * as cli from '../core/claude-cli.ts';
import * as tmpdir from '../core/tmpdir.ts';
import { makeCtx, check, render } from './check.ts';
import { questions } from './asks.ts';
import { applyUpdates } from './apply.ts';
import type { Env } from '../core/types.ts';
import type { RunCli } from '../apply/types.ts';
import type { MachineProbe } from '../fix/types.ts';
import type { Registry, UpdateArgs } from './types.ts';

// ---- CLI -------------------------------------------------------------------------------------------------------------

export function parseArgs(argv: string[]): UpdateArgs
{
    const args: UpdateArgs = { input: {} };
    for (let i = 0; i < argv.length; i++)
    {
        const a = argv[i]!;
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

export async function main(argv: string[], { env = process.env, out = (s: string) => process.stdout.write(`${s}\n`), machine, registry, now, runCli }: { env?: Env; out?: (line: string) => unknown; machine?: MachineProbe; registry?: Registry; now?: number; runCli?: RunCli } = {}): Promise<number>
{
    let args: UpdateArgs;
    try { args = parseArgs(argv); }
    catch (caught) { const e = caught as NodeJS.ErrnoException; out(`update: ${e.message}\nusage: node scripts/update.ts --check | --questions | --apply <id,id|all|none> [--input key=value] [--no-refresh] [--project <dir>] [--tmp <dir>] [--data <dir>]`); return 2; }
    const project = path.resolve(args.project || process.cwd());
    const inv = inventory.buildInventory({ project, env, run: runCli || cli.runClaude, data: args.data || null });
    if (!inv.cli!.ok) { out('preferred-tools: the claude CLI is not on PATH - install Claude Code, then run this again.'); return 3; }
    const ctx = makeCtx({ inv, project, env, machine, registry, now, runCli: runCli || cli.runClaude, refresh: !args['no-refresh'], data: args.data || null });
    const found = await check(ctx);
    if (args.apply)
    {
        const log = (...a: string[]) => out(a.join('\n'));
        const res = applyUpdates(ctx, args.apply.split(',').filter(Boolean), found, { tmp: args.tmp, log, input: args.input });
        // the last script on <tmp> removes it, unless fetch.js takes it on; apply() per server never does
        if (!res.fetchFile) tmpdir.releaseTempDir(res.dir, log);
        return res.failed.length || res.unknown.length ? 1 : 0;
    }
    if (args.questions) out(JSON.stringify(questions(found), null, 2));
    else if (args.json) out(JSON.stringify(found, null, 2));
    else out(render(found));
    return 0;
}

