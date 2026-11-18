// The one file of sign-in/ that starts a process: the client, with its stdout dropped and its stderr read line by line.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline';
import { shimOfLaunch, spawnArgs } from '../core/cmd-line.ts';
import { KILL_GRACE_MS, SIGNAL_EXIT_CODE, STDERR_GRACE_MS, TIMEOUT_ERROR_CODE } from './constants.ts';
import type { ChildProcess } from 'node:child_process';
import type { RunResult, SignalTarget, SignInRun } from './types.ts';

// How the client is spawned: the shared rule of core/cmd-line.ts spawnArgs (one command line on Windows, escaped by the file
// the name resolves to, the plain array elsewhere).
export const signInSpawnArgs = spawnArgs;

// the clients started and not yet closed, so an interrupted run can stop them
const running = new Set<ChildProcess>();

// A client and everything it started: TERM to its process group, then KILL after the grace (Windows: taskkill /T /F). The
// group is signalled even when the leader has exited, since a grandchild may still hold the callback port.
function stopTree(child: ChildProcess): void
{
    if (process.platform === 'win32')
    {
        if (child.exitCode === null && child.signalCode === null) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
        return;
    }
    const kill = (signal: NodeJS.Signals) => { try { process.kill(-child.pid!, signal); } catch { /* the group is gone */ } };
    kill('SIGTERM');
    setTimeout(() => kill('SIGKILL'), KILL_GRACE_MS).unref();
}

// Stops every client still running.
export const stopRunningClients = (): void => { for (const child of running) stopTree(child); };

// On an interrupt or a terminate, stops the client's tree and exits with 128 plus the signal, so the callback port is not left
// open by a detached client. `target`, `exit` and `stop` are the process, process.exit and the stop function; a test gives its own.
export function stopClientOnSignal(target: SignalTarget = process, exit: (code: number) => void = process.exit, stop: () => void = stopRunningClients): void
{
    for (const [signal, code] of Object.entries(SIGNAL_EXIT_CODE))
    {
        target.once(signal as NodeJS.Signals, () => { stop(); exit(code); });
    }
}

// stdin and stdout are ignored; stderr is read a line at a time and handed to `onStderrLine`, never written anywhere here.
// The run ends at the client's exit, or at the timeout with the same code spawnSync used (ETIMEDOUT) and the signal sent. A
// grandchild holding the stderr pipe open does not keep it alive: the pipe is closed a grace after the client exits.
export const realRun: SignInRun = (command, args, { cwd, env, timeoutMs }, onStderrLine) => new Promise<RunResult>((resolve) =>
{
    const shim = process.platform === 'win32' ? shimOfLaunch(command, args, env, fs.existsSync) : undefined;
    const launch = signInSpawnArgs(command, args, process.platform, shim);
    let child: ChildProcess;
    try { child = spawn(launch.file, launch.args, { cwd, env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], shell: launch.shell, detached: process.platform !== 'win32' }); }
    catch (caught) { resolve({ status: null, signal: null, error: caught as Error }); return; }
    running.add(child);
    let timedOut = false;
    let settled = false;
    let drainTimer: NodeJS.Timeout | undefined;
    const finish = (result: RunResult) =>
    {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(drainTimer);
        running.delete(child);
        resolve(result);
    };
    const timer = setTimeout(() =>
    {
        timedOut = child.exitCode === null && child.signalCode === null;
        stopTree(child);
    }, timeoutMs);
    if (child.stderr) readline.createInterface({ input: child.stderr, crlfDelay: Infinity }).on('line', onStderrLine);
    child.on('error', (error) => finish({ status: null, signal: null, error }));
    child.on('exit', () => { drainTimer = setTimeout(() => child.stderr?.destroy(), STDERR_GRACE_MS); });
    child.on('close', (status, signal) =>
    {
        const error = timedOut ? Object.assign(new Error('the sign-in run timed out'), { code: TIMEOUT_ERROR_CODE }) : null;
        finish({ status, signal: timedOut ? signal || 'SIGTERM' : signal, error });
    });
});
