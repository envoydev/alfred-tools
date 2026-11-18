// The apply command: reads the plan file and its flags, applies it and releases <tmp>.
import fs from 'node:fs';
import { blockingStdio } from '../core/json-file.ts';
import * as tmpdir from '../core/tmpdir.ts';
import { apply } from './run.ts';
import { isPlanFile } from './plan-file.ts';

export function runApplyCommand(argv: string[]): number
{
    blockingStdio();
    const file = argv[0];
    if (!file) { console.error('usage: apply.ts <plan.json> [--tmp <dir>] [--data <plugin data dir>]'); return 2; }
    let parsed: unknown;
    try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (caught) { console.error(`apply: cannot read ${file} (${caught instanceof Error ? caught.message : String(caught)})`); return 2; }
    if (!isPlanFile(parsed)) { console.error(`apply: ${file} is not a plan - nothing applied`); return 2; }
    const plan = parsed;
    if (plan.errors && plan.errors.length) { console.error(`apply: the plan has errors - nothing applied:\n${plan.errors.map((error) => `  ! ${error}`).join('\n')}`); return 1; }
    const flag = (name: string) => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : undefined; };
    const log = (...lines: string[]) => console.log(lines.join('\n'));
    const report = apply(plan, { tmp: flag('--tmp'), data: flag('--data') || null, log });
    // the last script on <tmp> removes it: this one, unless fetch.ts takes it on
    if (!report.fetchFile) tmpdir.releaseTempDir(report.tmp, log);
    return report.failed ? 1 : 0;
}

