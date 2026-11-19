// The prereq command: checks what this machine has and prints it.
import * as catalogLib from '../catalog/catalog.ts';
import * as account from '../core/account.ts';
import { errorMessage } from '../core/guards.ts';
import { realMachine } from '../core/machine.ts';
import { picksFrom, checkPrereqs, renderPrereqs } from './prereq.ts';
import { EXIT_CODE } from './constants.ts';
import type { Env } from '../core/types.ts';
import type { MachineProbe } from '../core/types.ts';
import type { PrereqPick } from './types.ts';

export function runPrereqCommand(argv: string[], { env = process.env, machine, platform = process.platform, out = (line: string) => process.stdout.write(`${line}\n`) }: { env?: Env; machine?: MachineProbe; platform?: string; out?: (line: string) => unknown } = {}): number
{
    const catalog = catalogLib.load();
    let picks: PrereqPick[] | null;
    try { picks = picksFrom(argv, catalog); }
    catch (caught) { out(`prereq: ${errorMessage(caught)}`); return EXIT_CODE.usage; }
    if (!picks) { out('usage: prereq.ts <answers.json> | --rows id,id  [--json]'); return EXIT_CODE.usage; }
    const unknown = picks.filter((pick) => !catalog.byId.has(pick.row));
    if (unknown.length) { out(`prereq: unknown tool ${unknown.map((unknownPick) => unknownPick.row).join(', ')}`); return EXIT_CODE.usage; }
    const context = { platform, env, home: account.homeDir(env), machine: machine || realMachine({ env, platform }) };
    const result = checkPrereqs(picks, context, catalog, { withAudit: argv.includes('--audit') });
    out(argv.includes('--json') ? JSON.stringify(result, null, 2) : renderPrereqs(result));
    return EXIT_CODE.ok;
}

