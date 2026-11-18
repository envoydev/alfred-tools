// The one file of sign-in/ that starts a process: the client, with its output dropped.
import { spawnSync } from 'node:child_process';
import { spawnArgs } from '../core/claude-cli.ts';
import type { SignInRun } from './types.ts';

// How the client is spawned: the shared rule of core/claude-cli.ts spawnArgs (one cmdArg command line on Windows, the
// plain array elsewhere).
export const signInSpawnArgs = spawnArgs;

// stdout and stderr are ignored, so nothing the client prints is held or shown; stdin is closed.
export const realRun: SignInRun = (command, args, { cwd, env, timeoutMs }) =>
{
    const spawnArgs = signInSpawnArgs(command, args, process.platform);
    const result = spawnSync(spawnArgs.file, spawnArgs.args, { cwd, env, timeout: timeoutMs, windowsHide: true, stdio: 'ignore', shell: spawnArgs.shell });
    return { status: result.status, signal: result.signal, error: result.error || null };
};
