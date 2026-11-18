// The one file of sign-in/ that starts a process: the client, with its output dropped.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { shimOfLaunch, spawnArgs } from '../core/cmd-line.ts';
import type { SignInRun } from './types.ts';

// How the client is spawned: the shared rule of core/cmd-line.ts spawnArgs (one cmdArg command line on Windows, the
// plain array elsewhere).
export const signInSpawnArgs = spawnArgs;

// stdout and stderr are ignored, so nothing the client prints is held or shown; stdin is closed.
export const realRun: SignInRun = (command, args, { cwd, env, timeoutMs }) =>
{
    const shim = process.platform === 'win32' ? shimOfLaunch(command, args, env, fs.existsSync) : undefined;
    const spawn = signInSpawnArgs(command, args, process.platform, shim);
    const result = spawnSync(spawn.file, spawn.args, { cwd, env, timeout: timeoutMs, windowsHide: true, stdio: 'ignore', shell: spawn.shell });
    return { status: result.status, signal: result.signal, error: result.error || null };
};
