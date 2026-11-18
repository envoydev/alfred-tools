// The Windows command line a runtime or client is started with: argument quoting for cmd.exe, shared by every script that
// spawns something through the shell (claude-cli.ts, fetch, sign-in).
import path from 'node:path';
import { DEFAULT_PATHEXT, PATH_LIST_SEPARATOR, PATH_SEPARATOR_PATTERN, SHIM_FILE_PATTERN, SHIM_NAME_PATTERN } from './cmd-line-constants.ts';

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

// cmd.exe reads the line once for the program it starts. A .cmd or .bat shim (npm's `npm.cmd`, `npx.cmd`) reads it a second
// time through its `%*`, so each metacharacter is caret-escaped twice (cmdArg); a real .exe (`uvx`, `docker`) gets only the
// first read, so one level (cmdArgOnce) - two would reach its argv as `^--help^`. This is cross-spawn's
// `escapeArgument(arg, doubleEscapeMetaChars)`: double only for a shim (docs/sources.md).
const META = /([()\][%!^"`<>&|;, *?])/g;
export const cmdArgOnce = (arg: string): string => argvQuote(arg).replace(META, '^$1');
export const cmdArg = (arg: string): string => cmdArgOnce(arg).replace(META, '^$1');

// The file a command name runs on Windows, as cmd.exe finds it: a name with a path or an extension is looked up as written
// (and, with no path, in each PATH directory), a bare name in each PATH directory with each PATHEXT extension in turn.
// `exists` is the file system, so the lookup itself holds none. -> the first file that exists, or null
export function resolveOnPath(name: string, env: Record<string, string | undefined>, exists: (file: string) => boolean): string | null
{
    const hasPath = PATH_SEPARATOR_PATTERN.test(name);
    if ((hasPath || path.extname(name)) && exists(name)) return name;
    if (hasPath) return null;
    const extensions = [...(path.extname(name) ? [''] : []), ...(env['PATHEXT'] || DEFAULT_PATHEXT).split(PATH_LIST_SEPARATOR).filter(Boolean)];
    const directories = (env['PATH'] ?? env['Path'] ?? '').split(PATH_LIST_SEPARATOR).map((directory) => directory.replace(/^"(.*)"$/, '$1')).filter(Boolean);
    for (const directory of directories)
    {
        for (const extension of extensions)
        {
            const file = path.join(directory, `${name}${extension}`);
            if (exists(file)) return file;
        }
    }
    return null;
}

// The program a launch starts: the command, or - when the command is `cmd /c` - what follows it, which cmd would start.
function launchOf(command: string, args: string[]): { name: string; rest: string[] }
{
    const [name = command, ...rest] = /^cmd(\.exe)?$/i.test(command) && /^\/c$/i.test(args[0] || '') ? args.slice(1) : [command, ...args];
    return { name, rest };
}

// Whether the file a launch's program resolves to is a shim: true for a .cmd or .bat, false for any other file (a Volta
// `npm.exe` is a real program), undefined when nothing resolves - spawnArgs then goes by the name.
export function shimOfLaunch(command: string, args: string[], env: Record<string, string | undefined>, exists: (file: string) => boolean): boolean | undefined
{
    const resolved = resolveOnPath(launchOf(command, args).name, env, exists);
    return resolved === null ? undefined : SHIM_FILE_PATTERN.test(resolved);
}

// How a runtime or client is spawned. Windows: ONE command line run through the shell with no args array. Node runs it as
// `cmd.exe /d /s /c "<line>"`, which reads the command name once and so keeps it bare; each ARGUMENT is escaped for the
// reads it gets - cmdArg for a shim, cmdArgOnce for anything else. `shim` is the caller's answer when it has resolved the
// file (shimOfLaunch, as cross-spawn decides by the resolved file); absent, the name decides (npm, npx, pnpm or yarn, or a
// name ending in .cmd or .bat). A `cmd /c` in front is dropped: it would add another read that leaves a `&`, `|` or `%`
// live. POSIX: the plain array, no shell.
export function spawnArgs(command: string, args: string[], platform: string, shim?: boolean): { file: string; args: string[]; shell: boolean }
{
    if (platform !== 'win32') return { file: command, args, shell: false };
    const { name, rest } = launchOf(command, args);
    const doubled = shim ?? SHIM_NAME_PATTERN.test(name);
    return { file: [name, ...rest.map(doubled ? cmdArg : cmdArgOnce)].join(' '), args: [], shell: true };
}
