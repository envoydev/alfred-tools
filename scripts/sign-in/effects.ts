// The one file of sign-in/ that starts a process: the client, with its stdout dropped and its stderr read line by line.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline';
import { shimOfLaunch, spawnArgs } from '../core/cmd-line.ts';
import { KILL_GRACE_MS, TIMEOUT_ERROR_CODE } from './constants.ts';
import type { ChildProcess } from 'node:child_process';
import type { RunResult, SignInRun } from './types.ts';

// How the client is spawned: the shared rule of core/cmd-line.ts spawnArgs (one command line on Windows, escaped by the file
// the name resolves to, the plain array elsewhere).
export const signInSpawnArgs = spawnArgs;

// The client and everything it started: TERM, then KILL after the grace (Windows: taskkill /T /F).
function stopTree(child: ChildProcess): void
{
    if (child.exitCode !== null || child.signalCode !== null) return;
    if (process.platform === 'win32') { spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }); return; }
    const kill = (signal: NodeJS.Signals) => { try { process.kill(-child.pid!, signal); } catch { /* already gone */ } };
    kill('SIGTERM');
    setTimeout(() => kill('SIGKILL'), KILL_GRACE_MS).unref();
}

// stdin and stdout are ignored; stderr is read a line at a time and handed to `onStderrLine`, never written anywhere here.
// The run ends at the client's exit, or at the timeout with the same code spawnSync used (ETIMEDOUT) and the signal sent.
export const realRun: SignInRun = (command, args, { cwd, env, timeoutMs }, onStderrLine) => new Promise<RunResult>((resolve) =>
{
    const shim = process.platform === 'win32' ? shimOfLaunch(command, args, env, fs.existsSync) : undefined;
    const launch = signInSpawnArgs(command, args, process.platform, shim);
    let child: ChildProcess;
    try { child = spawn(launch.file, launch.args, { cwd, env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], shell: launch.shell, detached: process.platform !== 'win32' }); }
    catch (caught) { resolve({ status: null, signal: null, error: caught as Error }); return; }
    let timedOut = false;
    let settled = false;
    const finish = (result: RunResult) =>
    {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
    };
    const timer = setTimeout(() => { timedOut = true; stopTree(child); }, timeoutMs);
    if (child.stderr) readline.createInterface({ input: child.stderr, crlfDelay: Infinity }).on('line', onStderrLine);
    child.on('error', (error) => finish({ status: null, signal: null, error }));
    child.on('close', (status, signal) =>
    {
        const error = timedOut ? Object.assign(new Error('the sign-in run timed out'), { code: TIMEOUT_ERROR_CODE }) : null;
        finish({ status, signal: timedOut ? signal || 'SIGTERM' : signal, error });
    });
});
