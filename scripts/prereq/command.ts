// The prereq command: checks what this machine has and prints it.
import * as catalogLib from '../catalog/catalog.ts';
import * as account from '../core/account.ts';
import { realMachine } from '../fix/common.ts';
import { picksFrom, check, render } from './prereq.ts';
import type { Env } from '../core/types.ts';
import type { MachineProbe } from '../fix/types.ts';
import type { PrereqPick } from './types.ts';

export function main(argv: string[], { env = process.env, machine, platform = process.platform, out = (s: string) => process.stdout.write(`${s}\n`) }: { env?: Env; machine?: MachineProbe; platform?: string; out?: (line: string) => unknown } = {}): number
{
    const catalog = catalogLib.load();
    let picks: PrereqPick[] | null;
    try { picks = picksFrom(argv, catalog); }
    catch (caught) { const e = caught as NodeJS.ErrnoException; out(`prereq: ${e.message}`); return 2; }
    if (!picks) { out('usage: prereq.ts <answers.json> | --rows id,id  [--json]'); return 2; }
    const unknown = picks.filter((p) => !catalog.byId.has(p.row));
    if (unknown.length) { out(`prereq: unknown tool ${unknown.map((u) => u.row).join(', ')}`); return 2; }
    const ctx = { platform, env, home: account.homeDir(env), machine: machine || realMachine({ env, platform }) };
    const res = check(picks, ctx, catalog, { withAudit: argv.includes('--audit') });
    out(argv.includes('--json') ? JSON.stringify(res, null, 2) : render(res));
    return 0;
}

