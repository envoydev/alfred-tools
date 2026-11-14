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
    for (const ch of String(arg))
    {
        if (ch === '\\') { slashes++; continue; }
        out += ch === '"' ? `${'\\'.repeat(slashes * 2 + 1)}"` : `${'\\'.repeat(slashes)}${ch}`;
        slashes = 0;
    }
    return `${out}${'\\'.repeat(slashes * 2)}"`;
}

// cmd.exe reads the line twice - once for `cmd /c`, once more for the .cmd file's `%*` - so each metacharacter is
// caret-escaped twice (cross-spawn's escapeArgument for a shim; measured through an npm-shaped shim, docs/sources.md).
const META = /([()\][%!^"`<>&|;, *?])/g;
export const cmdArg = (arg: string): string => argvQuote(arg).replace(META, '^$1').replace(META, '^$1');

export function run(args: string[], { cwd, env, input, timeout = 120000 }: CliOptions = {}): CliResult
{
    const opts = { encoding: 'utf8' as const, cwd, env: env || process.env, input, timeout, windowsHide: true, maxBuffer: 64 * 1024 * 1024 };
    let r = spawnSync('claude', args, opts);
    // npm's claude.cmd cannot be spawned directly on Windows (ENOENT or EINVAL): go through cmd.exe with quoted arguments.
    const code = r.error && (r.error as NodeJS.ErrnoException).code;
    if (process.platform === 'win32' && r.error && (code === 'ENOENT' || code === 'EINVAL'))
        r = spawnSync(['claude', ...args.map(cmdArg)].join(' '), { ...opts, shell: true });
    return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error || null, signal: r.signal };
}

export const available = (opts?: CliOptions): string | null => { const r = run(['--version'], opts); return !r.error && r.status === 0 ? r.stdout.trim() : null; };

