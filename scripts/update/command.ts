// The update command: reads its flags and runs the check, the asks or the apply.
import path from 'node:path';
import * as inventory from '../inventory/inventory.ts';
import * as cli from '../core/claude-cli.ts';
import * as tmpdir from '../core/tmpdir.ts';
import { makeCtx, checkUpdates, renderUpdates } from './check.ts';
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
        const argument = argv[i]!;
        if (['--check', '--questions', '--json', '--no-refresh'].includes(argument)) { args[argument.slice(2)] = true; continue; }
        if (!['--apply', '--project', '--tmp', '--data', '--input'].includes(argument)) throw new Error(`unknown argument '${argument}'`);
        const flagValue = argv[i + 1];
        if (flagValue === undefined || flagValue.startsWith('--')) throw new Error(`${argument} needs a value`);
        i++;
        // fix.js's rule: split on the first =, repeatable
        if (argument === '--input')
        {
            const separatorIndex = flagValue.indexOf('=');
            if (separatorIndex < 1) throw new Error('--input needs key=value');
            args.input[flagValue.slice(0, separatorIndex)] = flagValue.slice(separatorIndex + 1);
            continue;
        }
        if (Object.hasOwn(args, argument.slice(2))) throw new Error(`${argument} is given twice`);
        args[argument.slice(2)] = flagValue;
    }
    if (['check', 'questions', 'apply'].filter((mode) => args[mode]).length !== 1) throw new Error('give exactly one of --check, --questions or --apply');
    return args;
}

export async function runUpdateCommand(argv: string[], { env = process.env, out = (line: string) => process.stdout.write(`${line}\n`), machine, registry, now, runCli }: { env?: Env; out?: (line: string) => unknown; machine?: MachineProbe; registry?: Registry; now?: number; runCli?: RunCli } = {}): Promise<number>
{
    let args: UpdateArgs;
    try { args = parseArgs(argv); }
    catch (caught) { const error = caught as NodeJS.ErrnoException; out(`update: ${error.message}\nusage: node scripts/update.ts --check | --questions | --apply <id,id|all|none> [--input key=value] [--no-refresh] [--project <dir>] [--tmp <dir>] [--data <dir>]`); return 2; }
    const project = path.resolve(args.project || process.cwd());
    const projectInventory = inventory.buildInventory({ project, env, run: runCli || cli.runClaude, data: args.data || null });
    if (!projectInventory.cli!.ok) { out('preferred-tools: the claude CLI is not on PATH - install Claude Code, then run this again.'); return 3; }
    const context = makeCtx({ inventory: projectInventory, project, env, machine, registry, now, runCli: runCli || cli.runClaude, refresh: !args['no-refresh'], data: args.data || null });
    const found = await checkUpdates(context);
    if (args.apply)
    {
        const log = (...lines: string[]) => out(lines.join('\n'));
        const result = applyUpdates(context, args.apply.split(',').filter(Boolean), found, { tmp: args.tmp, log, input: args.input });
        // the last script on <tmp> removes it, unless fetch.js takes it on; apply() per server never does
        if (!result.fetchFile) tmpdir.releaseTempDir(result.dir, log);
        return result.failed.length || result.unknown.length ? 1 : 0;
    }
    if (args.questions) out(JSON.stringify(questions(found), null, 2));
    else if (args.json) out(JSON.stringify(found, null, 2));
    else out(renderUpdates(found));
    return 0;
}

