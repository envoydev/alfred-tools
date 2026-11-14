// prereq.ts: read-only checks of the machine, a missing one named with its install line or its vendor page.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as catalogLib from '../scripts/catalog/catalog.ts';
import { CHECKS, checkPrereqs, renderPrereqs } from '../scripts/prereq/prereq.ts';
import { runPrereqCommand } from '../scripts/prereq/command.ts';
import type { PrereqCtx, ToolCheck } from '../scripts/prereq/types.ts';
import type { MachineProbe, RunResult } from '../scripts/fix/types.ts';
import type { Env } from '../scripts/core/types.ts';

const catalog = catalogLib.load();

function machine({ files = [], bins = {}, out = {}, real = {}, node = '24.1.0' }: { files?: string[]; bins?: Record<string, string>; out?: Record<string, Partial<RunResult>>; real?: Record<string, string>; node?: string } = {}): MachineProbe & { calls: string[] }
{
    const calls: string[] = [];
    return {
        calls,
        exists: (p: string) => files.includes(p),
        which: (n: string) => bins[n] || null,
        realpath: (p: string) => real[p] || p,
        nodeVersion: node,
        run: (cmd: string, args: string[]) => { calls.push([cmd, ...args].join(' ')); const r = out[[cmd, ...args].join(' ')] || out[cmd]; return r ? { status: 0, ...r } as RunResult : { status: 1, stdout: '', stderr: '' }; },
    };
}
const ctx = (m: MachineProbe, over: Partial<PrereqCtx> = {}): PrereqCtx => ({ platform: 'darwin', env: {}, home: '/Users/dev', machine: m, ...over });
const one = (id: string, c: PrereqCtx) => CHECKS[id]!(c);

test('every prerequisite id the catalog uses has a check', () =>
{
    const ids = new Set<string>();
    for (const r of catalog.tools)
        for (const list of r.kind === 'plugin' ? [(r as { prereqs?: string[] }).prereqs || []] : Object.values(r.routes).map((x) => x.prereqs || [])) list.forEach((i) => ids.add(i));
    for (const id of ids) assert.strictEqual(typeof CHECKS[id], 'function', id);
    assert.deepStrictEqual([...ids].sort(), Object.keys(CHECKS).sort(), 'and no check is left without a user');
});

test('uvx and npx: found on the PATH, or the vendor page is named', () =>
{
    assert.deepStrictEqual(one('uvx', ctx(machine({ bins: { uvx: '/bin/uvx' }, out: { 'uvx --version': { stdout: 'uv 0.9.2\n' } } }))), { ok: true, found: 'uvx 0.9.2' });
    const no = one('uvx', ctx(machine()));
    assert.strictEqual(no.ok, false);
    assert.strictEqual(no.install!.url, 'https://docs.astral.sh/uv/getting-started/installation/');
    assert.ok(!no.install!.command, 'no command is printed that the vendor docs did not give');
    assert.strictEqual(one('npx', ctx(machine({ bins: { npx: '/usr/bin/npx' } }))).ok, true);
    assert.strictEqual(one('npx', ctx(machine())).install!.url, 'https://nodejs.org/en/download');
});

test('browser-chrome and browser-msedge: where each OS installs them', () =>
{
    assert.strictEqual(one('browser-chrome', ctx(machine({ files: ['/Applications/Google Chrome.app'] }))).ok, true);
    assert.strictEqual(one('browser-msedge', ctx(machine({ files: ['/Applications/Microsoft Edge.app'] }))).ok, true);
    assert.strictEqual(one('browser-chrome', ctx(machine({ files: ['/Applications/Microsoft Edge.app'] }))).ok, false);
    assert.strictEqual(one('browser-chrome', ctx(machine({ bins: { 'google-chrome-stable': '/usr/bin/google-chrome-stable' } }), { platform: 'linux' })).ok, true);
    assert.strictEqual(one('browser-chrome', ctx(machine(), { platform: 'linux' })).ok, false);
    const win = (files: string[]) => ctx(machine({ files }), { platform: 'win32', env: { ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local' }, home: 'C:\\Users\\dev' });
    assert.strictEqual(one('browser-chrome', win(['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'])).ok, true);
    assert.strictEqual(one('browser-msedge', win(['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'])).ok, true);
    assert.strictEqual(one('browser-msedge', win([])).ok, false);
    assert.match(one('browser-chrome', ctx(machine())).install!.note!, /name a browser binary/);
});

test('docker-or-github-binary: docker, else the binary, else the page - and the plan is told which', () =>
{
    assert.deepStrictEqual(one('docker-or-github-binary', ctx(machine({ bins: { docker: '/usr/bin/docker' } }))).machine, { docker: true });
    const bin = one('docker-or-github-binary', ctx(machine({ bins: { 'github-mcp-server': '/usr/bin/github-mcp-server' } })));
    assert.strictEqual(bin.ok, true);
    assert.deepStrictEqual(bin.machine, { docker: false }, 'no docker: the binary fallback');
    const none = one('docker-or-github-binary', ctx(machine()));
    assert.strictEqual(none.ok, false);
    assert.match(none.install!.note!, /github-mcp-server\/releases/);
});

test('android-sdk and jdk: looked up as the appium fix looks them up', () =>
{
    const m = machine({ files: ['/Users/dev/Library/Android/sdk', '/opt/jdk', '/opt/jdk/bin/java'], out: { '/usr/libexec/java_home': { stdout: '/opt/jdk\n' } } });
    assert.deepStrictEqual(one('android-sdk', ctx(m)), { ok: true, found: '/Users/dev/Library/Android/sdk' });
    assert.deepStrictEqual(one('jdk', ctx(m)), { ok: true, found: '/opt/jdk' });
    assert.strictEqual(one('android-sdk', ctx(machine())).install!.url, 'https://developer.android.com/studio');
    assert.strictEqual(one('jdk', ctx(machine())).ok, false);
});

test('check: each pick on its own route; a remote route needs nothing; the machine facts come back for the plan', () =>
{
    const m = machine({ bins: { npx: '/usr/bin/npx' } });
    const res = checkPrereqs([{ row: 'context7', route: 'remote' }, { row: 'context7', route: 'local' }, { row: 'github', route: 'local' }], ctx(m), catalog);
    assert.deepStrictEqual(res.tools.map((t) => [t.row, t.route, t.needs.map((n) => `${n.id}:${n.ok}`)]), [
        ['context7', 'remote', []], ['context7', 'local', ['npx:true']], ['github', 'local', ['docker-or-github-binary:false']],
    ]);
    assert.strictEqual(res.missing, 1);
    assert.deepStrictEqual(res.machine, { docker: true });
    const text = renderPrereqs(res);
    assert.match(text, /^context7 \(remote\): nothing to check$/m);
    assert.match(text, /^github \(local\): docker-or-github-binary - MISSING$/m);
    assert.match(text, /prereq: 1 missing$/);
});

test('main: an answers file, --rows, --json; a bad argument exits 2 and checks nothing', () =>
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-prereq-'));
    try
    {
        const file = path.join(dir, 'answers.json');
        fs.writeFileSync(file, JSON.stringify({ picks: { serena: {}, context7: { route: 'remote' } } }));
        const m = machine({ bins: { uvx: '/bin/uvx' } });
        let text = '';
        const out = (s: string) => { text += `${s}\n`; };
        assert.strictEqual(runPrereqCommand([file], { env: {}, machine: m, platform: 'darwin', out }), 0);
        assert.match(text, /serena \(local\): uvx - ok/);
        text = '';
        runPrereqCommand(['--rows', 'serena,context7', '--json'], { env: {}, machine: m, platform: 'darwin', out });
        const json = JSON.parse(text);
        assert.deepStrictEqual(json.tools.map((t: ToolCheck) => [t.row, t.route]), [['serena', 'local'], ['context7', 'remote']]);
        // configure: only a change to another route is checked
        fs.writeFileSync(file, JSON.stringify({ change: { 'mcp:c7~project': { row: 'context7', route: 'local' }, 'mcp:serena~user': { row: 'serena', name: 'nav' } } }));
        text = '';
        runPrereqCommand([file, '--json'], { env: {}, machine: m, platform: 'darwin', out });
        assert.deepStrictEqual(JSON.parse(text).tools.map((t: ToolCheck) => [t.row, t.route]), [['context7', 'local']]);
        for (const bad of [[], ['--rows', 'no-such-tool'], [path.join(dir, 'missing.json')]])
        {
            text = '';
            assert.strictEqual(runPrereqCommand(bad, { env: {}, machine: m, platform: 'darwin', out }), 2, JSON.stringify(bad));
        }
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('audit: the package is audited in a temp folder with --ignore-scripts and the row\'s cut-off; counts come from npm\'s JSON even when npm exits non-zero; a failure says it did not run', () =>
{
    const seen: { line: string; cwd: string | undefined; before: string | undefined; pkg: unknown }[] = [];
    const mk = ({ lock = 0, audit = 1, json }: { lock?: number; audit?: number; json?: string } = {}) => ({
        ...machine(),
        run: (cmd: string, args: string[], opts: { cwd?: string; env?: Env & { npm_config_before?: string } } = {}) =>
        {
            seen.push({ line: [cmd, ...args].join(' '), cwd: opts.cwd, before: (opts.env || {}).npm_config_before, pkg: opts.cwd && fs.existsSync(path.join(opts.cwd, 'package.json')) ? JSON.parse(fs.readFileSync(path.join(opts.cwd, 'package.json'), 'utf8')) : null });
            if (args[0] === 'install') return { status: lock, stdout: '', stderr: lock ? 'ENOTFOUND registry.npmjs.org' : '' };
            return { status: audit, stdout: json === undefined ? JSON.stringify({ metadata: { vulnerabilities: { low: 2, moderate: 0, high: 17, critical: 3, total: 22 } } }) : json, stderr: '' };
        },
    });
    const pick = [{ row: 'appium', route: 'local' }];
    const res = checkPrereqs(pick, ctx(mk()), catalog, { withAudit: true });
    assert.deepStrictEqual(res.tools[0]!.audit, { package: 'appium-mcp@1.99.3', ok: true, counts: { critical: 3, high: 17, moderate: 0, low: 2, total: 22 } });
    const install = seen.find((s) => /^npm install/.test(s.line));
    assert.match(install!.line, /--package-lock-only --ignore-scripts/);
    assert.strictEqual(install!.before, '2026-11-11T23:59:59Z', 'resolved at the row\'s cut-off, as npx will');
    assert.deepStrictEqual((install!.pkg as { dependencies: unknown }).dependencies, { 'appium-mcp': '1.99.3' });
    assert.ok(!fs.existsSync(install!.cwd!), 'the temp folder is removed');
    assert.match(renderPrereqs(res), /^appium: audit - appium-mcp@1\.99\.3 has 22 known vulnerabilities in its dependency tree \(3 critical, 17 high, 0 moderate, 2 low\)$/m);
    // not asked for: not run, no npm call
    seen.length = 0;
    assert.strictEqual(checkPrereqs(pick, ctx(mk()), catalog).tools[0]!.audit, undefined);
    assert.strictEqual(seen.filter((x) => /^npm /.test(x.line)).length, 0, 'no npm call without --audit');
    // offline, or output that is not npm's JSON: 'not run', never 'clean'
    const offline = checkPrereqs(pick, ctx(mk({ lock: 1 })), catalog, { withAudit: true }).tools[0]!.audit;
    assert.strictEqual(offline!.ok, false);
    assert.match(offline!.note!, /audit not run: npm install --package-lock-only failed: ENOTFOUND/);
    assert.match(checkPrereqs(pick, ctx(mk({ json: 'oops' })), catalog, { withAudit: true }).tools[0]!.audit!.note!, /audit not run: npm audit gave no result/);
    // a row that is not marked for audit is not audited
    assert.strictEqual(checkPrereqs([{ row: 'sentry', route: 'local' }], ctx(mk()), catalog, { withAudit: true }).tools[0]!.audit, undefined);
});
