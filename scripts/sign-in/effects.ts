// The one file of sign-in/ that starts a process: the client, with its output dropped.
import { spawnSync } from 'node:child_process';
import { cmdArg } from '../core/claude-cli.ts';
import type { SignInRun } from './types.ts';

// stdout and stderr are ignored, so nothing the client prints is held or shown; stdin is closed. On Windows the line goes
// through the shell with cmdArg quoting, as claude-cli.ts does, so npx.cmd resolves.
export const realRun: SignInRun = (command, args, { cwd, env, timeoutMs }) =>
{
    const options = { cwd, env, timeout: timeoutMs, windowsHide: true, stdio: 'ignore' as const };
    const result = process.platform === 'win32'
        ? spawnSync([command, ...args.map(cmdArg)].join(' '), { ...options, shell: true })
        : spawnSync(command, args, options);
    return { status: result.status, signal: result.signal, error: result.error || null };
};
