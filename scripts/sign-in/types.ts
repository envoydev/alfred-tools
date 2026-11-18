// The shapes sign-in/ reads and returns.
import type { Env } from '../core/types.ts';

// The client's launch line and the environment it runs with.
export interface SignInCommand
{
    command: string;
    args: string[];
    env: Record<string, string>;
}

// What a run of the client reports: the exit code (null when it did not exit), the signal that stopped it, a spawn error.
export interface RunResult
{
    status: number | null;
    signal: string | null;
    error: Error | null;
}

// Runs the client with its stdout dropped and hands each stderr line to `onStderrLine`, which only reads it; a test replaces it.
export type SignInRun = (command: string, args: string[], options: { cwd: string; env: Env; timeoutMs: number }, onStderrLine: (line: string) => void) => Promise<RunResult>;

export interface SignInOptions
{
    env: Env;
    run: SignInRun;
    project?: string | undefined;
    // where the one 'no browser opened' line goes while the client waits
    print?: ((line: string) => void) | undefined;
}

// What the stderr lines of one run came to: the sign-in link once seen, and what a line asks the caller to do.
export interface AuthorizeWatch
{
    // reads one line; -> the link when this line is the could-not-open line, for the first time, and a link is known
    feed: (line: string) => string | null;
    link: () => string | null;
}

export interface SignInResult
{
    ok: boolean;
    line: string;
}

export interface CommandOptions
{
    env?: Env | undefined;
    run?: SignInRun | undefined;
    project?: string | undefined;
    log?: ((...lines: string[]) => void) | undefined;
}
