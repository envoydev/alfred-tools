// claude-cli.ts: the cmd.exe route npm's claude.cmd takes on Windows. Every argument must reach the CLI as written - a
// JSON quote, %VAR%, carets, & and |, backslashes before a quote or the end, an empty argument.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as cli from '../scripts/core/claude-cli.ts';
import { cmdArgOnce, resolveOnPath, shimOfLaunch, spawnArgs } from '../scripts/core/cmd-line.ts';

test('argvQuote: the Windows argv rules - backslashes before a quote doubled plus one, before the end doubled, others kept', () =>
{
    assert.strictEqual(cli.argvQuote('plain'), '"plain"');
    assert.strictEqual(cli.argvQuote(''), '""');
    assert.strictEqual(cli.argvQuote('q"q'), '"q\\"q"');
    assert.strictEqual(cli.argvQuote('a\\"b'), '"a\\\\\\"b"');
    assert.strictEqual(cli.argvQuote('C:\\dir\\'), '"C:\\dir\\\\"');
    assert.strictEqual(cli.argvQuote('C:\\a b\\c'), '"C:\\a b\\c"');
});

test('cmdArg: the argv quoting, then each cmd.exe metacharacter caret-escaped twice (cmd /c, then the .cmd file\'s %* line)', () =>
{
    assert.strictEqual(cli.cmdArg('a&b'), '^^^"a^^^&b^^^"');
    assert.strictEqual(cli.cmdArg('%PATH%'), '^^^"^^^%PATH^^^%^^^"');
    assert.strictEqual(cli.cmdArg('q"q'), '^^^"q\\^^^"q^^^"');
});

test('spawnArgs: Windows keeps the command name bare (cmd reads it once) and caret-escapes each argument twice; POSIX is the plain array', () =>
{
    const win = spawnArgs('npm', ['exec', 'a&b'], 'win32');
    assert.ok(win.file.startsWith('npm '), win.file);
    assert.deepStrictEqual(win, { file: 'npm ^^^"exec^^^" ^^^"a^^^&b^^^"', args: [], shell: true });
    assert.strictEqual(spawnArgs('cmd', ['/c', 'npx', '-y'], 'win32').file, 'npx ^^^"-y^^^"', 'an inner cmd /c is dropped');
    assert.deepStrictEqual(spawnArgs('npm', ['exec', 'a&b'], 'linux'), { file: 'npm', args: ['exec', 'a&b'], shell: false });
});

test('cmdArgOnce: the argv quoting, then each cmd.exe metacharacter caret-escaped once (a real .exe gets one cmd read)', () =>
{
    assert.strictEqual(cmdArgOnce('a&b'), '^"a^&b^"');
    assert.strictEqual(cmdArgOnce('%PATH%'), '^"^%PATH^%^"');
    assert.strictEqual(cmdArgOnce('q"q'), '^"q\\^"q^"');
});

test('spawnArgs: a real .exe (uvx, docker) gets ONE caret level, so its argv reads --help and not ^--help^', () =>
{
    assert.deepStrictEqual(spawnArgs('uvx', ['--from', 'a&b'], 'win32'), { file: 'uvx ^"--from^" ^"a^&b^"', args: [], shell: true });
    assert.deepStrictEqual(spawnArgs('docker', ['pull', 'x'], 'win32'), { file: 'docker ^"pull^" ^"x^"', args: [], shell: true });
    assert.strictEqual(spawnArgs('cmd', ['/c', 'uvx', '--help'], 'win32').file, 'uvx ^"--help^"', 'an inner cmd /c is dropped here too');
});

test('spawnArgs: a .cmd shim keeps the double level - npx, npm, pnpm, yarn by name, anything ending in .cmd or .bat, any case', () =>
{
    assert.strictEqual(spawnArgs('npx', ['-y', 'a&b'], 'win32').file, 'npx ^^^"-y^^^" ^^^"a^^^&b^^^"');
    for (const shim of ['npm.cmd', 'NPM.CMD', 'pnpm', 'Yarn', 'tool.bat', 'C:\\bin\\x.cmd'])
    {
        assert.strictEqual(spawnArgs(shim, ['a&b'], 'win32').file, `${shim} ^^^"a^^^&b^^^"`, shim);
    }
    for (const exe of ['uvx.exe', 'docker.exe', 'npmx', 'cmdx'])
    {
        assert.strictEqual(spawnArgs(exe, ['a&b'], 'win32').file, `${exe} ^"a^&b^"`, exe);
    }
});

const NASTY = [JSON.stringify({ env: { K: 's%^"abc' } }), '%PATH%', 'x&y|z<>', 'caret^^', 'C:\\dir\\', 'a\\\\"b', '', 'a b', 'ünï'];

test('Windows: every argument reaches a .cmd shim through cmd.exe as written', { skip: process.platform !== 'win32' && 'NOT RUN: the cmd.exe route is Windows-only' }, () =>
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-cli-'));
    try
    {
        fs.writeFileSync(path.join(dir, 'echo.js'), 'process.stdout.write(JSON.stringify(process.argv.slice(2)))');
        // npm's shim shape: the node binary, the script beside the shim, %*
        fs.writeFileSync(path.join(dir, 'claude.cmd'), `@"${process.execPath}" "%~dp0\\echo.js" %*\r\n`);
        // only the shim's folder and System32: a real claude.exe further down PATH would be spawned directly instead
        const env = { ...process.env, PATH: [dir, path.join(process.env.SystemRoot || 'C:\\Windows', 'System32')].join(';') };
        const r = cli.runClaude(NASTY, { env });
        assert.strictEqual(r.status, 0, r.stderr);
        assert.deepStrictEqual(JSON.parse(r.stdout), NASTY);
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

const withBins = (names: string[][], body: (dirs: string[]) => void) =>
{
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-resolve-'));
    try
    {
        const dirs = names.map((files, index) =>
        {
            const dir = path.join(root, `bin${index}`);
            fs.mkdirSync(dir);
            for (const file of files) fs.writeFileSync(path.join(dir, file), '');
            return dir;
        });
        body(dirs);
    }
    finally { fs.rmSync(root, { recursive: true, force: true }); }
};

// the file names are upper case, as PATHEXT's default spells them, so a case-sensitive file system finds them too
test('resolveOnPath: a bare name finds the file its PATH directory holds, by PATHEXT order', () =>
{
    withBins([['npm.EXE']], ([exe]) =>
    {
        assert.strictEqual(resolveOnPath('npm', { PATH: exe! }, fs.existsSync), path.join(exe!, 'npm.EXE'));
    });
    withBins([['npm.CMD']], ([cmd]) =>
    {
        assert.strictEqual(resolveOnPath('npm', { PATH: cmd! }, fs.existsSync), path.join(cmd!, 'npm.CMD'));
    });
    withBins([['tool.CMD', 'tool.EXE']], ([both]) =>
    {
        assert.strictEqual(resolveOnPath('tool', { PATH: both! }, fs.existsSync), path.join(both!, 'tool.EXE'), 'the default PATHEXT puts .EXE before .CMD');
        assert.strictEqual(resolveOnPath('tool', { PATH: both!, PATHEXT: '.CMD;.EXE' }, fs.existsSync), path.join(both!, 'tool.CMD'), 'PATHEXT in the environment sets the order');
    });
});

test('resolveOnPath: the first PATH directory holding the name wins, Path is read when PATH is absent, nothing found is null', () =>
{
    withBins([['npm.CMD'], ['npm.EXE']], ([first, second]) =>
    {
        assert.strictEqual(resolveOnPath('npm', { PATH: `${first!};${second!}` }, fs.existsSync), path.join(first!, 'npm.CMD'));
        assert.strictEqual(resolveOnPath('npm', { PATH: `${second!};${first!}` }, fs.existsSync), path.join(second!, 'npm.EXE'));
        assert.strictEqual(resolveOnPath('npm', { Path: `${second!};${first!}` }, fs.existsSync), path.join(second!, 'npm.EXE'));
        assert.strictEqual(resolveOnPath('nothing', { PATH: `${first!};${second!}` }, fs.existsSync), null);
        assert.strictEqual(resolveOnPath('npm', {}, fs.existsSync), null);
    });
});

test('resolveOnPath: a name with a path or an extension is looked up as written', () =>
{
    withBins([['npm.EXE', 'run.cmd']], ([dir]) =>
    {
        const full = path.join(dir!, 'npm.EXE');
        assert.strictEqual(resolveOnPath(full, { PATH: '' }, fs.existsSync), full, 'a path that exists is itself');
        assert.strictEqual(resolveOnPath(path.join(dir!, 'gone.EXE'), { PATH: dir! }, fs.existsSync), null, 'a path that does not exist is not searched on PATH');
        assert.strictEqual(resolveOnPath('run.cmd', { PATH: dir! }, fs.existsSync), path.join(dir!, 'run.cmd'), 'an extension needs no PATHEXT');
    });
});

test('shimOfLaunch: true for a .cmd or .bat the name resolves to, false for any other file, undefined when nothing resolves; an inner cmd /c is looked through', () =>
{
    withBins([['npm.EXE', 'npx.CMD', 'old.BAT']], ([dir]) =>
    {
        const env = { PATH: dir! };
        assert.strictEqual(shimOfLaunch('npm', ['exec'], env, fs.existsSync), false);
        assert.strictEqual(shimOfLaunch('npx', ['-y'], env, fs.existsSync), true);
        assert.strictEqual(shimOfLaunch('old', [], env, fs.existsSync), true);
        assert.strictEqual(shimOfLaunch('cmd', ['/c', 'npx', '-y'], env, fs.existsSync), true);
        assert.strictEqual(shimOfLaunch('cmd', ['/c', 'npm', 'x'], env, fs.existsSync), false);
        assert.strictEqual(shimOfLaunch('uvx', [], env, fs.existsSync), undefined);
    });
});

test('spawnArgs: a shim value given by the caller decides - a Volta-style npm.exe gets one level, and true forces two', () =>
{
    assert.deepStrictEqual(spawnArgs('npm', ['exec', 'a&b'], 'win32', false), { file: 'npm ^"exec^" ^"a^&b^"', args: [], shell: true });
    assert.deepStrictEqual(spawnArgs('uvx', ['a&b'], 'win32', true), { file: 'uvx ^^^"a^^^&b^^^"', args: [], shell: true });
    assert.deepStrictEqual(spawnArgs('cmd', ['/c', 'npm', 'a&b'], 'win32', false), { file: 'npm ^"a^&b^"', args: [], shell: true });
    assert.deepStrictEqual(spawnArgs('npm', ['exec', 'a&b'], 'win32', undefined), spawnArgs('npm', ['exec', 'a&b'], 'win32'), 'undefined falls back to the name rule');
    assert.deepStrictEqual(spawnArgs('npm', ['a&b'], 'linux', true), { file: 'npm', args: ['a&b'], shell: false }, 'POSIX is the plain array whatever the shim');
});

test('resolveOnPath: PATH and PATHEXT are found whatever their case, and the last matching key wins as in a Windows environment block', () =>
{
    withBins([['tool.CMD', 'tool.EXE'], ['tool.CMD']], ([both, cmdOnly]) =>
    {
        assert.strictEqual(resolveOnPath('tool', { path: both! }, fs.existsSync), path.join(both!, 'tool.EXE'), 'path');
        assert.strictEqual(resolveOnPath('tool', { PATH: both!, pathext: '.CMD' }, fs.existsSync), path.join(both!, 'tool.CMD'), 'pathext');
        assert.strictEqual(resolveOnPath('tool', { PATH: both!, Path: cmdOnly! }, fs.existsSync), path.join(cmdOnly!, 'tool.CMD'), 'the later of PATH and Path wins');
        assert.strictEqual(resolveOnPath('tool', { Path: cmdOnly!, PATH: both! }, fs.existsSync), path.join(both!, 'tool.EXE'), 'and the later one again when the order is the other');
        assert.strictEqual(resolveOnPath('tool', { PATH: both!, PATHEXT: '.CMD', Pathext: '.EXE' }, fs.existsSync), path.join(both!, 'tool.EXE'), 'PATHEXT too');
    });
});

test('resolveOnPath: a bare name is looked for in the cwd first, as cmd.exe does, before any PATH directory', () =>
{
    withBins([['npm.EXE'], ['npm.CMD']], ([onPath, here]) =>
    {
        assert.strictEqual(resolveOnPath('npm', { PATH: onPath! }, fs.existsSync, here), path.join(here!, 'npm.CMD'));
        assert.strictEqual(resolveOnPath('npm', { PATH: onPath! }, fs.existsSync, path.dirname(here!)), path.join(onPath!, 'npm.EXE'), 'a cwd without it falls through to PATH');
        assert.strictEqual(resolveOnPath('npm', { PATH: onPath! }, fs.existsSync), path.join(onPath!, 'npm.EXE'), 'no cwd given: PATH alone');
    });
});

test('resolveOnPath: a relative name with an extension or a path is resolved against the given cwd, not the process cwd', () =>
{
    withBins([['run.cmd', 'sub.CMD']], ([here]) =>
    {
        assert.strictEqual(resolveOnPath('run.cmd', { PATH: '' }, fs.existsSync, here), path.join(here!, 'run.cmd'));
        assert.strictEqual(resolveOnPath('run.cmd', { PATH: '' }, fs.existsSync), null, 'the process cwd has no run.cmd');
        const parent = path.dirname(here!);
        assert.strictEqual(resolveOnPath(path.join(path.basename(here!), 'run.cmd'), { PATH: '' }, fs.existsSync, parent), path.join(parent, path.basename(here!), 'run.cmd'), 'a relative path with a folder');
        assert.strictEqual(resolveOnPath(path.join(path.basename(here!), 'run.cmd'), { PATH: '' }, fs.existsSync, here), null, 'and not from another cwd');
    });
});

test('resolveOnPath: surrounding quotes on a PATH entry are stripped', () =>
{
    withBins([['npm.EXE']], ([dir]) =>
    {
        assert.strictEqual(resolveOnPath('npm', { PATH: `"${dir!}"` }, fs.existsSync), path.join(dir!, 'npm.EXE'));
        assert.strictEqual(resolveOnPath('npm', { PATH: `;"${dir!}";` }, fs.existsSync), path.join(dir!, 'npm.EXE'), 'empty entries are skipped');
    });
});

test('shimOfLaunch passes the spawn cwd to the lookup', () =>
{
    withBins([['mine.CMD']], ([here]) =>
    {
        assert.strictEqual(shimOfLaunch('mine', [], { PATH: '' }, fs.existsSync, here), true);
        assert.strictEqual(shimOfLaunch('mine', [], { PATH: '' }, fs.existsSync), undefined);
    });
});
