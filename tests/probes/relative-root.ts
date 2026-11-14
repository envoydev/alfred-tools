#!/usr/bin/env node
// THE RELATIVE DATA FOLDER - does a tool resolve the relative data folder project scope writes against the folder it
// starts in? Each row is launched as plan.ts builds it at project scope (data folder `.preferred-tools/<name>`), over
// stdio, from a root folder R and then from R/child, under a throwaway HOME, and the file the tool writes into its data
// folder is looked for. A row with two passes may carry `locations.relative: true` in catalog/tools.json.
//
//   node tests/probes/relative-root.ts [--rows serena,memory,playwright-chrome,appium] [--list] [--keep] [--scratch <dir>]
//
// Per run: initialize, notifications/initialized, tools/list, the row's call, then the data file is looked for:
//   serena   serena_config.yml   written into SERENA_HOME at start (no call)
//   memory   memory.db           created at start (no call)
//   browsers Local State         the browser profile's own file: browser_navigate about:blank, then browser_close
//   appium   *.png               appium_screenshot, which needs a device session
// PASS: the file is under <cwd>/.preferred-tools/<name>, and no new copy of it appeared anywhere else under HOME or R.
// A named tool missing from tools/list fails the row loudly (a pin bump renamed it: run --list and update CALLS).
//
// One line per run: RESULT <row> <root|child> <pass|fail> <where the data file was found>. Exit 1 when a named tool is
// missing, else 0. Packages download into the throwaway folder's cache on the first run (minutes). The browser runs
// headless (no window; it does not change where the profile goes). --list prints each server's tool names and exits.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildEntry } from '../../scripts/entries/entry.ts';
import { load } from '../../scripts/catalog/catalog.ts';
import type { ServerEntry } from '../../scripts/core/types.ts';
const catalog = load();

// a tool call the probe makes, a reply to it, and what one session saw
interface Call
{
    name: string;
    arguments: unknown;
}
interface Reply
{
    error?: unknown;
    result?: { isError?: boolean; content?: unknown };
}
interface Probed
{
    tools: string[];
    replies: Reply[];
    error: string | null;
}

const DATA_FILE: Record<string, string> = { serena: 'serena_config.yml', memory: 'memory.db', appium: '.png' };
const CALLS: Record<string, Call[]> = {
    appium: [{ name: 'appium_screenshot', arguments: {} }],
};
const isBrowser = (id: string) => id.startsWith('playwright-');
const dataFile = (id: string) => (isBrowser(id) ? 'Local State' : DATA_FILE[id]!);
const callsOf = (id: string): Call[] => (isBrowser(id) ? [{ name: 'browser_navigate', arguments: { url: 'about:blank' } }, { name: 'browser_close', arguments: {} }] : CALLS[id] || []);
const matches = (id: string, file: string) => (dataFile(id).startsWith('.') ? file.endsWith(dataFile(id)) : file === dataFile(id));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function args(argv: string[])
{
    const out: { rows: string[]; list: boolean; keep: boolean; scratch: string | null } = { rows: ['serena', 'memory', 'playwright-chrome', 'appium'], list: false, keep: false, scratch: null };
    for (let i = 0; i < argv.length; i++)
    {
        if (argv[i] === '--rows') out.rows = argv[++i]!.split(',').filter(Boolean);
        else if (argv[i] === '--list') out.list = true;
        else if (argv[i] === '--keep') out.keep = true;
        else if (argv[i] === '--scratch') out.scratch = argv[++i]!;
        else throw new Error(`unknown argument ${argv[i]}`);
    }
    return out;
}

// every file named like the row's data file under a folder -> [absolute path]
function copies(id: string, dir: string)
{
    const out: string[] = [];
    const walk = (d: string, depth: number): void =>
    {
        if (depth > 12) return;
        let list;
        try { list = fs.readdirSync(d, { withFileTypes: true }); }
        catch { return; }
        for (const e of list)
        {
            const p = path.join(d, e.name);
            if (e.isDirectory() && !e.isSymbolicLink()) walk(p, depth + 1);
            else if (matches(id, e.name)) out.push(p);
        }
    };
    walk(dir, 0);
    return out;
}

// One stdio session: initialize, tools/list, the calls in order. -> { tools, replies, error }
function session(entry: ServerEntry, { cwd, env, calls, timeoutMs = 600000 }: { cwd: string; env: NodeJS.ProcessEnv; calls: Call[]; timeoutMs?: number })
{
    return new Promise<Probed>((resolve) =>
    {
        const win = process.platform === 'win32';
        const p = spawn(entry.command!, entry.args || [], { cwd, env: { ...env, ...(entry.env || {}) }, stdio: ['pipe', 'pipe', 'pipe'], detached: !win, shell: false });
        let buf = '';
        let stderr = '';
        let done = false;
        const out: Probed = { tools: [], replies: [], error: null };
        const finish = (error: string | null) =>
        {
            if (done) return;
            done = true;
            out.error = error || null;
            clearTimeout(timer);
            try { if (win) spawn('taskkill', ['/pid', String(p.pid), '/t', '/f']); else process.kill(-p.pid!, 'SIGKILL'); }
            catch { /* already gone */ }
            resolve(out);
        };
        const timer = setTimeout(() => finish(`no reply in ${timeoutMs / 1000}s`), timeoutMs);
        const send = (m: Record<string, unknown>) => p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`);
        let next = 3;
        const callNext = () =>
        {
            const c = calls.shift();
            if (!c) return finish(null);
            send({ id: next++, method: 'tools/call', params: c });
            return undefined;
        };
        p.stderr.on('data', (d) => { stderr = (stderr + d.toString()).slice(-4000); });
        p.on('error', (e) => finish(`could not start: ${e.message}`));
        p.on('exit', (code) => finish(`exited ${code} before the calls ended: ${stderr.trim().split('\n').slice(-2).join(' | ')}`));
        p.stdout.on('data', (d) =>
        {
            buf += d.toString();
            let i;
            while ((i = buf.indexOf('\n')) >= 0)
            {
                const line = buf.slice(0, i);
                buf = buf.slice(i + 1);
                let m;
                try { m = JSON.parse(line); }
                catch { continue; }
                if (m.id === 1)
                {
                    send({ method: 'notifications/initialized' });
                    send({ id: 2, method: 'tools/list' });
                }
                else if (m.id === 2)
                {
                    out.tools = ((m.result && m.result.tools) || []).map((t: { name: string }) => t.name);
                    const missing = calls.filter((c) => !out.tools.includes(c.name)).map((c) => c.name);
                    if (missing.length) return finish(`MISSING TOOL ${missing.join(', ')}`);
                    callNext();
                }
                else if (typeof m.id === 'number' && m.id >= 3)
                {
                    out.replies.push(m);
                    callNext();
                }
            }
            return undefined;
        });
        send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'relative-root-probe', version: '1' } } });
    });
}

async function runRow(id: string, base: string, cache: string, opts: ReturnType<typeof args>)
{
    const row = catalog.byId.get(id);
    if (!row || !row.locations) throw new Error(`${id}: not a catalog row with a data folder`);
    const dir = fs.mkdtempSync(path.join(base, `${id}-`));
    const HOME = path.join(dir, 'home');
    const R = path.join(dir, 'R');
    const child = path.join(R, 'child');
    for (const d of [HOME, child]) fs.mkdirSync(d, { recursive: true });
    const ctx = { platform: process.platform, arch: process.arch, project: R, home: HOME, env: {}, machine: {} };
    const entry = buildEntry(row, 'local', { rootStr: `.preferred-tools/${row.name}`, scope: 'project', params: {} }, ctx, catalog.rules);
    if (isBrowser(id)) entry.args = [...entry.args!, '--headless'];
    console.log(`LAUNCH ${id} ${entry.command} ${(entry.args || []).join(' ')} ${JSON.stringify(entry.env || {})}`);
    const env = {
        ...process.env, HOME, USERPROFILE: HOME,
        // one cache for every row and run, outside HOME and R, so a package downloads once
        XDG_CACHE_HOME: cache, npm_config_cache: path.join(cache, 'npm'), UV_CACHE_DIR: path.join(cache, 'uv'), UV_PYTHON_INSTALL_DIR: path.join(cache, 'uv-python'),
    };
    let missing = false;
    for (const [where, cwd] of [['root', R], ['child', child]] as [string, string][])
    {
        const before = new Set([...copies(id, HOME), ...copies(id, R)]);
        const s = await session(entry, { cwd, env, calls: opts.list ? [] : callsOf(id).map((c) => ({ ...c })) });
        if (opts.list) { console.log(`TOOLS ${id} ${s.tools.join(' ')}`); break; }
        if (s.error && /^MISSING TOOL/.test(s.error)) { missing = true; console.log(`RESULT ${id} ${where} fail - ${s.error}`); break; }
        const expected = path.join(cwd, '.preferred-tools', row.name);
        // a browser may flush its profile on close: give the file a moment to land
        let fresh: string[] = [];
        for (let t = 0; t < 30; t++)
        {
            fresh = [...copies(id, HOME), ...copies(id, R)].filter((f) => !before.has(f));
            if (fresh.length) break;
            await sleep(500);
        }
        const failedCall = s.replies.find((m) => m.error || (m.result && m.result.isError));
        const show = (f: string) => path.relative(dir, f);
        if (!fresh.length)
        {
            const why = id === 'appium' && failedCall ? 'no device' : s.error || (failedCall ? `the call failed: ${JSON.stringify(failedCall.error || failedCall.result!.content).slice(0, 160)}` : 'no data file written');
            console.log(`RESULT ${id} ${where} fail - ${why}`);
            continue;
        }
        const inside = fresh.filter((f) => f.startsWith(expected + path.sep));
        const outside = fresh.filter((f) => !inside.includes(f));
        console.log(`RESULT ${id} ${where} ${inside.length && !outside.length ? 'pass' : 'fail'} ${fresh.map(show).join(', ')}`);
    }
    if (!opts.keep) fs.rmSync(dir, { recursive: true, force: true });
    else console.log(`KEPT ${dir}`);
    return { missing };
}

(async () =>
{
    const opts = args(process.argv.slice(2));
    const base = fs.realpathSync(fs.mkdtempSync(path.join(opts.scratch || os.tmpdir(), 'relative-root-')));
    const cache = path.join(base, 'cache');
    fs.mkdirSync(cache, { recursive: true });
    console.log(`probe: node ${process.versions.node}, ${process.platform} ${process.arch}; rows ${opts.rows.join(', ')}`);
    let missing = false;
    for (const id of opts.rows)
    {
        missing = (await runRow(id, base, cache, opts)).missing || missing;
    }
    if (!opts.keep) fs.rmSync(base, { recursive: true, force: true });
    process.exit(missing ? 1 : 0);
})();
