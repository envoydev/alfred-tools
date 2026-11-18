// The one file of sign-in/ that starts a process: the client, with its output dropped.
import { spawnSync } from 'node:child_process';
import { cmdArg } from '../core/claude-cli.ts';
import type { SignInRun } from './types.ts';

// How the client is spawned. Windows: ONE command line, `npx` and each argument quoted with cmdArg, run through the shell
// with no args array - cmdArg escapes for exactly two reads (Node's cmd.exe, then the npx.cmd shim), so a registration's
// `cmd /c` in front is dropped: it would add a third read that leaves a `&`, `|` or `%` of the URL live. POSIX: the plain array.
export function signInSpawnArgs(command: string, args: string[], platform: string): { file: string; args: string[]; shell: boolean }
{
    if (platform !== 'win32') return { file: command, args, shell: false };
    const line = /^cmd(\.exe)?$/i.test(command) && /^\/c$/i.test(args[0] || '') ? args.slice(1) : [command, ...args];
    return { file: line.map(cmdArg).join(' '), args: [], shell: true };
}

// stdout and stderr are ignored, so nothing the client prints is held or shown; stdin is closed.
export const realRun: SignInRun = (command, args, { cwd, env, timeoutMs }) =>
{
    const spawnArgs = signInSpawnArgs(command, args, process.platform);
    const result = spawnSync(spawnArgs.file, spawnArgs.args, { cwd, env, timeout: timeoutMs, windowsHide: true, stdio: 'ignore', shell: spawnArgs.shell });
    return { status: result.status, signal: result.signal, error: result.error || null };
};
