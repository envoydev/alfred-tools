// The one place the `claude` CLI is spawned. Scripts READ files; every write to .mcp.json, the account file and the
// plugin records goes through this (invariant: the CLI is the only writer) - save mcps-list/mcp-order.ts's reorder-only
// rewrite of .mcp.json (the user's ruling, 2026-11-11).
import { spawnSync } from 'node:child_process';
import { cmdArg } from './cmd-line.ts';
import { CLI_MAX_BUFFER_BYTES, CLI_TIMEOUT_MS } from './constants.ts';
import type { CliOptions, CliResult } from './types.ts';

export { argvQuote, cmdArg } from './cmd-line.ts';

export function runClaude(args: string[], { cwd, env, input, timeout = CLI_TIMEOUT_MS }: CliOptions = {}): CliResult
{
    const options = { encoding: 'utf8' as const, cwd, env: env || process.env, input, timeout, windowsHide: true, maxBuffer: CLI_MAX_BUFFER_BYTES };
    let result = spawnSync('claude', args, options);
    // npm's claude.cmd cannot be spawned directly on Windows (ENOENT or EINVAL): go through cmd.exe with quoted arguments.
    if (process.platform === 'win32' && result.error && ((result.error as NodeJS.ErrnoException).code === 'ENOENT' || (result.error as NodeJS.ErrnoException).code === 'EINVAL'))
        result = spawnSync(['claude', ...args.map(cmdArg)].join(' '), { ...options, shell: true });
    return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '', error: result.error || null, signal: result.signal };
}

export const available = (options?: CliOptions): string | null => { const result = runClaude(['--version'], options); return !result.error && result.status === 0 ? result.stdout.trim() : null; };

