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

// Runs the client with its output dropped; a test replaces it.
export type SignInRun = (command: string, args: string[], options: { cwd: string; env: Env; timeoutMs: number }) => RunResult;

export interface SignInOptions
{
    env: Env;
    run: SignInRun;
    project?: string | undefined;
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
