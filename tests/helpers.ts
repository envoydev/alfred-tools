// @ts-nocheck - typed in Task 12
// Shared test scaffolding: a throwaway project and account dir, and the fake `claude` on PATH.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { load } from '../scripts/catalog/catalog.ts';
import { shellArg } from '../scripts/entries/entry.ts';

// every ${VAR} a catalog route reads its key from
export const TOKEN_VARS = [...new Set(load().tools.flatMap((r) => Object.values(r.routes || {}).map((x) => x.tokenVar).filter(Boolean)))];

export const FAKE = path.join(import.meta.dirname, 'fake-claude.ts');
const RUNTIME = path.join(import.meta.dirname, 'fake-runtime.ts');
const SHIMMED = ['claude', 'npm', 'uvx', 'docker'];

// The PATH a world puts after its `bin`. On Windows a spawn looks for `<name>.exe` or `.com` on PATH and never for the
// `.cmd` shims in `bin`, so a real claude.exe (the native installer's) would answer instead of the fake: the folders
// holding a real one are left out, the spawn fails, and claude-cli.js takes its cmd.exe route to the shim.
function basePath(platform = process.platform, envPath = process.env.PATH || '')
{
    const parts = envPath.split(path.delimiter);
    if (platform !== 'win32') return parts.join(path.delimiter);
    return parts.filter((d) => !SHIMMED.some((n) => ['.exe', '.com'].some((x) => fs.existsSync(path.join(d, `${n}${x}`))))).join(path.delimiter);
}

// A throwaway world: { dir, project, account, home, bin, log, env, calls() }. `claude` on its PATH is the fake.
export function world(prefix = 'pt-')
{
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
    const project = path.join(dir, 'project');
    const account = path.join(dir, 'account');
    const home = path.join(dir, 'home');
    const bin = path.join(dir, 'bin');
    for (const d of [project, account, home, bin, path.join(dir, 'state')]) fs.mkdirSync(d, { recursive: true });
    const shim = (name, script, ...pre) =>
    {
        const file = path.join(bin, process.platform === 'win32' ? `${name}.cmd` : name);
        if (process.platform === 'win32') fs.writeFileSync(file, `@echo off\r\nnode "${script}" ${pre.join(' ')} %*\r\n`);
        else { fs.writeFileSync(file, `#!/bin/sh\nexec "${process.execPath}" "${script}" ${pre.join(' ')} "$@"\n`); fs.chmodSync(file, 0o755); }
    };
    shim('claude', FAKE);
    // the runtimes a fetch step calls: recorded, never run (tests/fake-runtime.ts)
    for (const rt of ['npm', 'uvx', 'docker']) shim(rt, RUNTIME, rt);
    const log = path.join(dir, 'calls.jsonl');
    const fetchLog = path.join(dir, 'fetches.jsonl');
    const env = { ...process.env };
    // the catalog's key variables come from the test itself, never from the shell that runs it (the plan's defaults read them)
    for (const k of TOKEN_VARS) delete env[k];
    // npm's cache is the world's, never the real one: `npm test` hands its scripts npm_config_cache, which npx-cache-entry
    // reads ahead of npm's own answer
    for (const k of Object.keys(env)) if (k.toLowerCase() === 'npm_config_cache') delete env[k];
    // Windows names it `Path`: one key only, so no child sees the PATH without `bin`
    for (const k of Object.keys(env)) if (k !== 'PATH' && k.toUpperCase() === 'PATH') delete env[k];
    Object.assign(env, {
        HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: account,
        PATH: `${bin}${path.delimiter}${basePath()}`, FAKE_CLAUDE_LOG: log, FAKE_CLAUDE_STATE: path.join(dir, 'state'), FAKE_RUNTIME_LOG: fetchLog,
    });
    delete env.FAKE_CLAUDE_FAIL;
    delete env.FAKE_RUNTIME_FAIL;
    const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).argv) : []);
    const fetches = () => (fs.existsSync(fetchLog) ? fs.readFileSync(fetchLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
    const writes = () => calls().filter((a) => (a[0] === 'mcp' && ['add-json', 'remove'].includes(a[1])) || (a[0] === 'plugin' && !['list'].includes(a[1]) && !(a[1] === 'marketplace' && a[2] === 'list')));
    const clean = () => fs.rmSync(dir, { recursive: true, force: true });
    return { dir, project, account, home, bin, log, env, calls, writes, fetches, clean };
}

export const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
export const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
// The account `projects` key the real CLI writes for a folder (docs/sources.md): its real path, or on Windows the cwd as
// typed, in `/`. fake-claude.js writes the same.
export const accountKey = (project) => (process.platform === 'win32' ? path.resolve(project).replace(/\\/g, '/') : fs.realpathSync.native(project));

// A temp folder of the world's own, for a script run as a child: TMPDIR (TEMP and TMP on Windows) point into it, so the
// script's os.tmpdir() is there and nothing in the machine's temp folder is made, swept or removed. `made()` is a folder
// as tmpdir.js makes one; `files(dir)` every file below a folder.
export function tempOf(w)
{
    const root = path.join(w.dir, 'temp');
    fs.mkdirSync(root, { recursive: true });
    const env = { ...w.env, TMPDIR: root, TEMP: root, TMP: root };
    const made = (prefix = 'preferred-tools-') => fs.mkdtempSync(path.join(fs.realpathSync(root), prefix));
    return { root, env, made };
}
export function files(dir)
{
    const out = [];
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : out.push(path.join(d, e.name))));
    if (fs.existsSync(dir)) walk(dir);
    return out;
}

// The headersHelper a registration names for the helper at `file`, as this platform's apply writes it: the path in
// forward slashes on Windows (entries.js shellArg, style 'win32'), as it is elsewhere
export const helperCmd = (file, name, scheme) => `node ${shellArg(file, process.platform === 'win32' ? 'win32' : 'posix')} ${name} ${scheme}`;

