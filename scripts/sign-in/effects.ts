// The one file of sign-in/ that reaches the machine: it reads the registration, starts the client - its stdout dropped, its
// stderr read line by line in memory for the sign-in link, nothing it prints kept - and checks for the stored sign-in by
// name, never opening it. mcp-remote's own client signs in outside Claude Code's 30-second start limit.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline';
import * as account from '../core/account.ts';
import { shimOfLaunch, spawnArgs } from '../core/cmd-line.ts';
import { signInParts } from '../entries/sign-in.ts';
import { watchAuthorize } from './authorize-link.ts';
import { failureOf, signInCommand, tokensFileOf } from './sign-in.ts';
import { KILL_GRACE_MS, LINE, RUN_TIMEOUT_MS, SIGNAL_EXIT_CODE, STDERR_GRACE_MS, TIMEOUT_ERROR_CODE } from './constants.ts';
import type { ChildProcess } from 'node:child_process';
import type { CommandIo, CommandOptions, RunResult, SignalTarget, SignInOptions, SignInResult, SignInRun } from './types.ts';

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
    // a client that never started has no pid, and nothing to stop
    const pid = child.pid;
    if (pid === undefined) return;
    const kill = (signal: NodeJS.Signals) => { try { process.kill(-pid, signal); } catch { /* the group is gone */ } };
    kill('SIGTERM');
    setTimeout(() => kill('SIGKILL'), KILL_GRACE_MS).unref();
}

// Stops every client still running.
export const stopRunningClients = (): void => { for (const child of running) stopTree(child); };

// On an interrupt or a terminate, stops the client's tree and exits with 128 plus the signal, so the callback port is not left
// open by a detached client. `target`, `exit` and `stop` are the process, process.exit and the stop function; a test gives its own.
export function stopClientOnSignal(target: SignalTarget = process, exit: (code: number) => void = process.exit, stop: () => void = stopRunningClients): void
{
    for (const [signal, code] of SIGNAL_EXIT_CODE)
    {
        target.once(signal, () => { stop(); exit(code); });
    }
}

// stdin and stdout are ignored; stderr is read a line at a time and handed to `onStderrLine`, never written anywhere here.
// The run ends at the client's exit, or at the timeout with the same code spawnSync used (ETIMEDOUT) and the signal sent. A
// grandchild holding the stderr pipe open does not keep it alive: the pipe is closed a grace after the client exits.
export const realRun: SignInRun = (command, args, { cwd, env, timeoutMs }, onStderrLine) => new Promise<RunResult>((resolve) =>
{
    const shim = process.platform === 'win32' ? shimOfLaunch(command, args, env, fs.existsSync, cwd) : undefined;
    const launch = signInSpawnArgs(command, args, process.platform, shim);
    let child: ChildProcess;
    try { child = spawn(launch.file, launch.args, { cwd, env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], shell: launch.shell, detached: process.platform !== 'win32' }); }
    catch (caught) { resolve({ status: null, signal: null, error: caught instanceof Error ? caught : new Error(String(caught)) }); return; }
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

// -> Promise<{ ok, line }>: 'signed in', or why not. Exit 0 and a sign-in stored for the entry's URL are both needed.
export async function signIn(name: string, scope: string, { env, run, project = process.cwd(), print = () => {} }: SignInOptions): Promise<SignInResult>
{
    const entry = account.readRegistration(name, scope, project, env);
    if (!entry) return { ok: false, line: `no server '${name}' at ${scope} scope` };
    const launch = signInCommand(entry, process.platform);
    const parts = signInParts(entry);
    if (!launch || !parts) return { ok: false, line: LINE.notSharedForm };
    const watch = watchAuthorize();
    const onStderrLine = (line: string) =>
    {
        const link = watch.feed(line);
        if (link) print(`${name}: no browser opened - open this link to sign in: ${link}`);
    };
    const result = await run(launch.command, launch.args, { cwd: project, env: { ...env, ...launch.env }, timeoutMs: RUN_TIMEOUT_MS }, onStderrLine);
    if (result.error || result.signal || result.status !== 0) return { ok: false, line: failureOf(result, watch.link()) };
    if (!fs.existsSync(tokensFileOf(parts.dir, parts.url))) return { ok: false, line: LINE.noTokens };
    return { ok: true, line: LINE.signedIn };
}

// What the command reads and prints: each from its options where a test gives it, else this process's.
export const commandIo = (options: CommandOptions): CommandIo => ({
    env: options.env ?? process.env,
    run: options.run ?? realRun,
    project: options.project ?? process.cwd(),
    log: options.log ?? ((...lines: string[]) => console.log(lines.join('\n'))),
    warn: (line: string) => console.error(line),
});
