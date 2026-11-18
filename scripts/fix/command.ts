// The fix command: reads its flags and runs the detectors, the asks or the fixes.
import path from 'node:path';
import * as inventory from '../inventory/inventory.ts';
import * as tmpdir from '../core/tmpdir.ts';
import { makeCtx, applyFixes, detectAll, questions, renderFixes } from './fix.ts';
import type { Env } from '../core/types.ts';
import type { FixArgs, MachineProbe } from './types.ts';

// ---- CLI ------------------------------------------------------------------------------------------------------------

function parseArgs(argv: string[]): FixArgs
{
    const args: FixArgs = { input: {} };
    const value = (i: number, flag: string) =>
    {
        const flagValue = argv[i + 1];
        if (flagValue === undefined || flagValue === '' || flagValue.startsWith('--')) throw new Error(`${flag} needs a value`);
        return flagValue;
    };
    for (let i = 0; i < argv.length; i++)
    {
        const argument = argv[i]!;
        if (['--detect', '--questions', '--json'].includes(argument)) { args[argument.slice(2)] = true; continue; }
        if (!['--apply', '--only', '--input', '--project', '--tmp', '--data'].includes(argument)) throw new Error(`unknown argument '${argument}'`);
        const flagValue = value(i, argument);
        i++;
        if (argument === '--input')
        {
            const separatorIndex = flagValue.indexOf('=');
            if (separatorIndex < 1) throw new Error('--input needs key=value');
            args.input[flagValue.slice(0, separatorIndex)] = flagValue.slice(separatorIndex + 1);
        }
        else
        {
            if (Object.hasOwn(args, argument.slice(2))) throw new Error(`${argument} is given twice`);
            args[argument.slice(2)] = flagValue;
        }
    }
    const modes = ['detect', 'questions', 'apply'].filter((mode) => args[mode]);
    if (modes.length !== 1) throw new Error('give exactly one of --detect, --questions or --apply');
    return args;
}

export function runFixCommand(argv: string[], { env = process.env, out = (line: string) => process.stdout.write(`${line}\n`), machine }: { env?: Env; out?: (line: string) => unknown; machine?: MachineProbe } = {}): number
{
    let args: FixArgs;
    try { args = parseArgs(argv); }
    catch (caught) { const error = caught as NodeJS.ErrnoException; out(`fix: ${error.message}\nusage: node scripts/fix.ts --detect | --questions | --apply <id,id|all> [--only <x>] [--input key=value] [--project <dir>] [--data <dir>]`); return 2; }
    const project = path.resolve(args.project || process.cwd());
    const data = args.data || null;
    const projectInventory = inventory.buildInventory({ project, env, data });
    if (!projectInventory.cli!.ok) { out('alfred-tools: the claude CLI is not on PATH - install Claude Code, then run this again.'); return 3; }
    const context = makeCtx({ inventory: projectInventory, env, machine, data });
    if (args.apply)
    {
        const log = (...lines: string[]) => out(lines.join('\n'));
        const result = applyFixes(context, args.apply.split(',').filter(Boolean), { only: args.only, input: args.input, tmp: args.tmp, log });
        // the last script on <tmp> removes it, unless fetch.ts takes it on
        if (!result.fetchFile) tmpdir.releaseTempDir(result.tmp, log);
        return result.failed ? 1 : 0;
    }
    const detected = detectAll(context, { only: args.only });
    if (args.questions) out(JSON.stringify(questions(detected), null, 2));
    else out(args.json ? JSON.stringify(detected, null, 2) : renderFixes(detected));
    return 0;
}

