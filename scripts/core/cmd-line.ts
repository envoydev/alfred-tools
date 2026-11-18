// The Windows command line a runtime or client is started with: argument quoting for cmd.exe, shared by every script that
// spawns something through the shell (claude-cli.ts, fetch, sign-in).

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

// How a runtime or client is spawned. Windows: ONE command line run through the shell with no args array. Node runs it as
// `cmd.exe /d /s /c "<line>"`, which reads the command name once and so keeps it bare; each ARGUMENT goes through cmdArg,
// which escapes for the two reads it gets (that cmd.exe, then the .cmd shim's %*). A `cmd /c` in front is dropped: it
// would add a third read that leaves a `&`, `|` or `%` live. POSIX: the plain array, no shell.
export function spawnArgs(command: string, args: string[], platform: string): { file: string; args: string[]; shell: boolean }
{
    if (platform !== 'win32') return { file: command, args, shell: false };
    const [name = command, ...rest] = /^cmd(\.exe)?$/i.test(command) && /^\/c$/i.test(args[0] || '') ? args.slice(1) : [command, ...args];
    return { file: [name, ...rest.map(cmdArg)].join(' '), args: [], shell: true };
}
