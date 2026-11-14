// The fetch command: runs a fetch file and releases its <tmp>.
import fs from 'node:fs';
import path from 'node:path';
import * as tmpdir from '../core/tmpdir.ts';
import { blockingStdio } from '../core/json-file.ts';
import { VERSION, run } from './fetch.ts';
import type { FetchJob } from './types.ts';

export async function main(argv: string[]): Promise<number>
{
    blockingStdio();
    const file = argv[0];
    if (!file) { console.error('usage: fetch.ts <fetch.json>'); return 2; }
    let j: FetchJob;
    try { j = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (caught) { const e = caught as NodeJS.ErrnoException; console.error(`fetch: cannot read ${file} (${e.message})`); return 2; }
    if (j.version !== VERSION || !Array.isArray(j.fetch) || !Array.isArray(j.check) || !j.project) { console.error(`fetch: ${file} is not a fetch file of version ${VERSION}`); return 2; }
    const log = (...a: string[]) => console.log(a.join('\n'));
    const res = await run(j, { log });
    // the last script on the command's <tmp>: the folder the fetch file sits in goes with it
    tmpdir.releaseTempDir(path.dirname(path.resolve(file)), log);
    return res.warnings.length ? 1 : 0;
}

