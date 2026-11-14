// The apply command: reads the plan file and its flags, applies it and releases <tmp>.
import fs from 'node:fs';
import { blockingStdio } from '../core/json-file.ts';
import * as tmpdir from '../core/tmpdir.ts';
import { apply } from './run.ts';
import type { Plan } from '../plan/types.ts';

export function main(argv: string[]): number
{
    blockingStdio();
    const file = argv[0];
    if (!file) { console.error('usage: apply.ts <plan.json> [--tmp <dir>] [--data <plugin data dir>]'); return 2; }
    const plan: Plan = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (plan.errors && plan.errors.length) { console.error(`apply: the plan has errors - nothing applied:\n${plan.errors.map((e) => `  ! ${e}`).join('\n')}`); return 1; }
    const flag = (name: string) => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : undefined; };
    const log = (...a: string[]) => console.log(a.join('\n'));
    const report = apply(plan, { tmp: flag('--tmp'), data: flag('--data') || null, log });
    // the last script on <tmp> removes it: this one, unless fetch.js takes it on
    if (!report.fetchFile) tmpdir.release(report.tmp, log);
    return report.failed ? 1 : 0;
}

