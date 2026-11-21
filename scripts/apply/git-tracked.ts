// Whether git tracks a file, asked so that a git that cannot answer is never read as 'no'. Exit 1 is 'not tracked'; exit 128
// is 'not tracked' only when git says the folder is no repository (dubious ownership and a damaged repository exit 128 too);
// git missing or any other answer is 'unknown'.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { GitRunner } from './types.ts';

const NOT_A_REPOSITORY = /not a git repository/i;

// git's own words are asked for in English, so the check on its message holds in every locale
export const runGit: GitRunner = (args, cwd) =>
{
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, env: { ...process.env, LC_ALL: 'C' } });
    return { status: result.status, stderr: result.stderr || '', error: result.error };
};

export function trackedState(file: string, run: GitRunner = runGit): 'tracked' | 'untracked' | 'unknown'
{
    const answer = run(['ls-files', '--error-unmatch', '--', path.basename(file)], path.dirname(file));
    if (answer.error) return 'unknown';
    if (answer.status === 0) return 'tracked';
    if (answer.status === 1) return 'untracked';
    return answer.status === 128 && NOT_A_REPOSITORY.test(answer.stderr) ? 'untracked' : 'unknown';
}
