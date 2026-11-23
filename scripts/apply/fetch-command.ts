// The fetch command: runs a fetch file and releases its <tmp>.
import fs from 'node:fs';
import path from 'node:path';
import * as tmpdir from '../core/tmpdir.ts';
import { blockingStdio } from '../core/json-file.ts';
import { errorMessage } from '../core/guards.ts';
import { VERSION, runFetchJob } from './fetch.ts';
import type { FetchJob } from './types.ts';

export async function runFetchCommand(argv: string[]): Promise<number>
{
    blockingStdio();
    const file = argv[0];
    if (!file) { console.error('usage: fetch.mjs <fetch.json>'); return 2; }
    let job: FetchJob;
    try { job = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (caught) { console.error(`fetch: cannot read ${file} (${errorMessage(caught)})`); return 2; }
    if (job.version !== VERSION || !Array.isArray(job.fetch) || !Array.isArray(job.check) || !job.project) { console.error(`fetch: ${file} is not a fetch file of version ${VERSION}`); return 2; }
    const log = (...lines: string[]) => console.log(lines.join('\n'));
    const result = await runFetchJob(job, { log });
    // the last script on the command's <tmp>: the folder the fetch file sits in goes with it
    tmpdir.releaseTempDir(path.dirname(path.resolve(file)), log);
    return result.warnings.length ? 1 : 0;
}

