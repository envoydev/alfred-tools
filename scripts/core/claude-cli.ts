// The one place the `claude` CLI is spawned. Scripts READ files; every write to .mcp.json, the account file and the
// plugin records goes through this (invariant: the CLI is the only writer).
import { spawnSync } from 'node:child_process';
import type { CliOptions, CliResult } from './types.ts';

// One argument as the Windows argv rules read it - the node npm's claude.cmd starts parses its line this way: wrapped in
// quotes, a run of backslashes before a quote doubled plus one for the quote, a run before the closing quote doubled,
// others kept (https://learn.microsoft.com/en-us/cpp/c-language/parsing-c-command-line-arguments).
export function argvQuote(arg: string): string
{
    let out = '"';
    let slashes = 0;
    for (const character of String(arg))
    {
        if (character === '\\') { slashes++; continue; }
        out += character === '"' ? `${'\\'.repeat(slashes * 2 + 1)}"` : `${'\\'.repeat(slashes)}${character}`;
        slashes = 0;
    }
    return `${out}${'\\'.repeat(slashes * 2)}"`;
}

// cmd.exe reads the line twice - once for `cmd /c`, once more for the .cmd file's `%*` - so each metacharacter is
// caret-escaped twice (cross-spawn's escapeArgument for a shim; measured through an npm-shaped shim, docs/sources.md).
const META = /([()\][%!^"`<>&|;, *?])/g;
export const cmdArg = (arg: string): string => argvQuote(arg).replace(META, '^$1').replace(META, '^$1');

// How a runtime or client is spawned. Windows: ONE command line, each part quoted with cmdArg, run through the shell with
// no args array - cmdArg escapes for exactly two reads (Node's cmd.exe, then the .cmd shim's %*), so a `cmd /c` in front is
// dropped: it would add a third read that leaves a `&`, `|` or `%` live. POSIX: the plain array, no shell.
export function spawnArgs(command: string, args: string[], platform: string): { file: string; args: string[]; shell: boolean }
{
    if (platform !== 'win32') return { file: command, args, shell: false };
    const line = /^cmd(\.exe)?$/i.test(command) && /^\/c$/i.test(args[0] || '') ? args.slice(1) : [command, ...args];
    return { file: line.map(cmdArg).join(' '), args: [], shell: true };
}

export function runClaude(args: string[], { cwd, env, input, timeout = 120000 }: CliOptions = {}): CliResult
{
    const options = { encoding: 'utf8' as const, cwd, env: env || process.env, input, timeout, windowsHide: true, maxBuffer: 64 * 1024 * 1024 };
    let result = spawnSync('claude', args, options);
    // npm's claude.cmd cannot be spawned directly on Windows (ENOENT or EINVAL): go through cmd.exe with quoted arguments.
    if (process.platform === 'win32' && result.error && ((result.error as NodeJS.ErrnoException).code === 'ENOENT' || (result.error as NodeJS.ErrnoException).code === 'EINVAL'))
        result = spawnSync(['claude', ...args.map(cmdArg)].join(' '), { ...options, shell: true });
    return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '', error: result.error || null, signal: result.signal };
}

export const available = (options?: CliOptions): string | null => { const result = runClaude(['--version'], options); return !result.error && result.status === 0 ? result.stdout.trim() : null; };

