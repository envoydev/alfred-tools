// The start-timeout row: Claude Code gives a server 30 s to start, and a server launched through npx, uvx or docker asks a
// registry first, so MCP_TIMEOUT in Claude Code's settings (env) gives it more. The writer, the plan tail and the fix row.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { load } from '../scripts/catalog/catalog.ts';
import { world, readJson } from './helpers.ts';
import { runSteps } from './apply-helpers.ts';
import { ctxFor, ctxOf, logged, put, reg, seed } from './fix-helpers.ts';
import { MAC, POSIX_FIXTURE, inv, opts, pickOne } from './plan-helpers.ts';
import { detectAll, applyFixes } from '../scripts/fix/fix.ts';
import { settingsEnv } from '../scripts/apply/file-steps.ts';
import { plan } from '../scripts/plan/plan.ts';
import { renderPlan } from '../scripts/plan/render.ts';
import { startTimeoutOf } from '../scripts/plan/repair-tail.ts';
import { START_TIMEOUT } from '../scripts/plan/start-timeout-constants.ts';
import { run, fakeRegistry, ago } from './update-helpers.ts';
import type { SettingsEnvStep } from '../scripts/plan/types.ts';
import type { World } from './types.ts';

const SETTING = { MCP_TIMEOUT: '90000' };
const NPX_CHROME = { command: 'npx', args: ['-y', '@playwright/mcp@0.0.85', '--browser', 'chrome', '--no-webmcp'], env: {} };
const HOSTED = { type: 'http', url: 'https://mcp.context7.com/mcp' };
const settingsOf = (w: World) => path.join(w.env.CLAUDE_CONFIG_DIR || path.join(w.home, '.claude'), 'settings.json');
const found = (w: World) => detectAll(ctxOf(w)).found.filter((f) => f.id === 'start-timeout');
const runFix = (w: World) => { const l = logged(); const res = applyFixes(ctxOf(w), ['start-timeout'], { tmp: path.join(w.dir, 'tmp'), log: l.log }); return { res, l }; };
const installedIn = (dir: string) => put(path.join(dir, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'alfred-tools@envoydev': [{ scope: 'user', version: '0.7.0' }] } }));

test('the value and the variable name are named once', () =>
{
    assert.deepStrictEqual(START_TIMEOUT, { name: 'MCP_TIMEOUT', value: '90000' });
});

test('the start-timeout row lists the catalog rows with a route that launches through npx, uvx, docker, the bridge or the sign-in form, and is an upgrade of 0.7.0', () =>
{
    const catalog = load();
    const launching = catalog.tools.filter((tool) => Object.values(tool.routes).some((route) => ['npx', 'uvx', 'docker', 'bridge'].includes(route.runtime ?? '') || route.keyless === 'oauth')).map((tool) => tool.id);
    const row = catalog.fixes.find((fix) => fix.id === 'start-timeout')!;
    assert.deepStrictEqual([...row.tool].sort(), launching.sort());
    assert.deepStrictEqual([row.upgrade, row.kind, row.os, row.detect, row.steps, row.fix], ['0.7.0', 'file', ['darwin', 'linux', 'win32'], 'startTimeoutDetect', 'startTimeoutSteps', null]);
});

// ---- the writer -------------------------------------------------------------------------------------------------------

test('settings-env adds only the names the file lacks, keeps every other key and value, and never replaces an existing value', () =>
{
    const w = world();
    try
    {
        const file = path.join(w.dir, 'account', 'settings.json');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, '﻿' + JSON.stringify({ model: 'x', env: { FOO: '1' }, permissions: { deny: ['Bash(rm:*)'] }, z: 1 }, null, 2));
        const r = runSteps(w, [{ op: 'settings-env', file, env: SETTING, why: 'x' }]);
        assert.strictEqual(r.report.failed, null, r.text);
        const doc = readJson(file);
        assert.deepStrictEqual(doc, { model: 'x', env: { FOO: '1', MCP_TIMEOUT: '90000' }, permissions: { deny: ['Bash(rm:*)'] }, z: 1 });
        assert.deepStrictEqual(Object.keys(doc), ['model', 'env', 'permissions', 'z']);
        // a second run changes nothing
        const again = settingsEnv(file, SETTING);
        assert.deepStrictEqual([again.ok, again.unchanged], [true, true]);
        // a value the user set - a number too - is never replaced
        for (const mine of ['120000', 45000])
        {
            fs.writeFileSync(file, JSON.stringify({ env: { MCP_TIMEOUT: mine } }));
            const kept = settingsEnv(file, SETTING);
            assert.deepStrictEqual([kept.ok, kept.unchanged], [true, true]);
            assert.deepStrictEqual(readJson(file), { env: { MCP_TIMEOUT: mine } });
        }
        // an absent file and its folder are made
        const fresh = path.join(w.dir, 'account', 'fresh', 'settings.json');
        assert.strictEqual(settingsEnv(fresh, SETTING).ok, true);
        assert.deepStrictEqual(readJson(fresh), { env: SETTING });
        assert.deepStrictEqual(fs.readdirSync(path.dirname(fresh)), ['settings.json'], 'no temporary file is left');
    }
    finally { w.clean(); }
});

test('settings-env writes nothing to a settings file that is not an object, or whose env is not one, and names the file', () =>
{
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'pt-env-')));
    try
    {
        for (const text of ['{ nope', '[]', '{"env": []}', '{"env": "x"}'])
        {
            const file = path.join(dir, 'settings.json');
            fs.writeFileSync(file, text);
            const r = settingsEnv(file, SETTING);
            assert.strictEqual(r.ok, false, text);
            assert.match(r.detail, /settings\.json/);
            assert.match(r.detail, /MCP_TIMEOUT/);
            assert.strictEqual(fs.readFileSync(file, 'utf8'), text);
        }
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- the shared check -------------------------------------------------------------------------------------------------

test('startTimeoutOf reads the settings file of CLAUDE_CONFIG_DIR, else the home\'s .claude, and another dir when given one', () =>
{
    const w = world();
    try
    {
        const context = { platform: process.platform, home: w.home, env: {} };
        const plain = path.join(w.home, '.claude', 'settings.json');
        assert.deepStrictEqual(startTimeoutOf(context), { file: plain, missing: true });
        put(plain, JSON.stringify({ env: { MCP_TIMEOUT: '1' } }));
        assert.deepStrictEqual(startTimeoutOf(context), { file: plain, missing: false });
        const conf = path.join(w.dir, 'conf');
        assert.deepStrictEqual(startTimeoutOf({ ...context, env: { CLAUDE_CONFIG_DIR: conf } }), { file: path.join(conf, 'settings.json'), missing: true });
        const other = path.join(w.home, '.claude-personal');
        put(path.join(other, 'settings.json'), '[]');
        assert.deepStrictEqual(startTimeoutOf(context, other), { file: path.join(other, 'settings.json'), bad: true });
    }
    finally { w.clean(); }
});

test('a MCP_TIMEOUT the environment already holds counts as set, so a value the shell chose is never overridden', () =>
{
    const w = world();
    try
    {
        const plain = path.join(w.home, '.claude', 'settings.json');
        assert.deepStrictEqual(startTimeoutOf({ platform: process.platform, home: w.home, env: { MCP_TIMEOUT: '180000' } }), { file: plain, missing: false });
    }
    finally { w.clean(); }
});

test('a settings file that cannot be read is no file to write: startTimeoutOf calls it bad, never missing', { skip: process.platform === 'win32' ? 'chmod does not deny a read on Windows' : false }, () =>
{
    const w = world();
    try
    {
        const plain = path.join(w.home, '.claude', 'settings.json');
        put(plain, '{}');
        fs.chmodSync(plain, 0o000);
        // root reads a 000 file anyway: then the test proves nothing, so it says so
        let readable = true;
        try { fs.readFileSync(plain); } catch { readable = false; }
        if (readable) return;
        assert.deepStrictEqual(startTimeoutOf({ platform: process.platform, home: w.home, env: {} }), { file: plain, bad: true });
    }
    finally { try { fs.chmodSync(path.join(w.home, '.claude', 'settings.json'), 0o600); } catch { /* gone */ } w.clean(); }
});

// ---- install and configure --------------------------------------------------------------------------------------------

const planIn = (conf: string, answers: Parameters<typeof plan>[1]) => plan(inv(MAC), answers, opts('/Users/me', { env: { CLAUDE_CONFIG_DIR: conf } }));

test('an install of an npx route plans one settings-env step, with the plan line', { skip: POSIX_FIXTURE }, () =>
{
    const w = world();
    try
    {
        const conf = path.join(w.dir, 'claude-config');
        const p = planIn(conf, pickOne('playwright-chrome', { scope: 'user' }));
        assert.deepStrictEqual(p.errors, []);
        const steps = p.steps.filter((s): s is SettingsEnvStep => s.op === 'settings-env');
        assert.deepStrictEqual(steps.map((s) => [s.file, s.env]), [[path.join(conf, 'settings.json'), SETTING]]);
        assert.ok(renderPlan(p).includes(`   adds MCP_TIMEOUT=90000 to env in ${path.join(conf, 'settings.json')}  (gives a server 90 s to start - npx asks the npm registry first)`), renderPlan(p));
        // two npx servers still plan one step
        const two = planIn(conf, { picks: { 'playwright-chrome': { scope: 'user' }, appium: { scope: 'user' } } });
        assert.strictEqual(two.steps.filter((s) => s.op === 'settings-env').length, 1);
    }
    finally { w.clean(); }
});

test('an install of a hosted http route plans no settings-env step', () =>
{
    const w = world();
    try
    {
        const p = planIn(path.join(w.dir, 'claude-config'), pickOne('context7', { route: 'remote', scope: 'user', token: false }));
        assert.deepStrictEqual(p.errors, []);
        assert.ok(p.steps.some((s) => s.op === 'mcp-add'));
        assert.ok(!p.steps.some((s) => s.op === 'settings-env'), p.steps.map((s) => s.op).join());
    }
    finally { w.clean(); }
});

test('settings that already hold MCP_TIMEOUT, at any value, plan no step; one that is not an object is a note and the plan is still written', { skip: POSIX_FIXTURE }, () =>
{
    const w = world();
    try
    {
        const conf = path.join(w.dir, 'claude-config');
        put(path.join(conf, 'settings.json'), JSON.stringify({ env: { MCP_TIMEOUT: '1000' } }));
        const has = planIn(conf, pickOne('playwright-chrome', { scope: 'user' }));
        assert.ok(has.steps.some((s) => s.op === 'mcp-add'));
        assert.ok(!has.steps.some((s) => s.op === 'settings-env'));
        put(path.join(conf, 'settings.json'), '{ nope');
        const bad = planIn(conf, pickOne('playwright-chrome', { scope: 'user' }));
        assert.ok(bad.steps.some((s) => s.op === 'mcp-add'), 'the rest of the plan is written');
        assert.ok(!bad.steps.some((s) => s.op === 'settings-env'));
        assert.ok(bad.notes.some((n) => n.startsWith(`${path.join(conf, 'settings.json')} is not a settings object`) && n.includes('MCP_TIMEOUT')), bad.notes.join('\n'));
    }
    finally { w.clean(); }
});

// ---- fix --------------------------------------------------------------------------------------------------------------

test('start-timeout finds an npx-launched managed server and no setting, applies settings-env, then finds nothing', () =>
{
    const w = world();
    try
    {
        seed(w, 'playwright-chrome', 'user', NPX_CHROME);
        put(settingsOf(w), JSON.stringify({ theme: 'dark', env: { FOO: '1' } }));
        const list = found(w);
        assert.deepStrictEqual(list.map((f) => [f.name, f.scope]), [[settingsOf(w), null]]);
        assert.strictEqual(list[0]!.found, `${settingsOf(w)} has no MCP_TIMEOUT - Claude Code gives a server 30 s to start, and npx asks the npm registry first, so a slow first network of the day fails it until /mcp Reconnect`);
        const { res, l } = runFix(w);
        assert.strictEqual(res.failed, null, l.text());
        assert.deepStrictEqual(readJson(settingsOf(w)), { theme: 'dark', env: { FOO: '1', MCP_TIMEOUT: '90000' } });
        assert.deepStrictEqual(found(w), []);
    }
    finally { w.clean(); }
});

test('start-timeout finds nothing when the setting is there, at any value', () =>
{
    const w = world();
    try
    {
        seed(w, 'playwright-chrome', 'user', NPX_CHROME);
        for (const mine of ['1000', '120000', 45000])
        {
            put(settingsOf(w), JSON.stringify({ env: { MCP_TIMEOUT: mine } }));
            assert.deepStrictEqual(found(w), [], String(mine));
        }
    }
    finally { w.clean(); }
});

test('start-timeout finds nothing for a hosted http route only', () =>
{
    const w = world();
    try
    {
        seed(w, 'context7', 'user', HOSTED);
        assert.deepStrictEqual(found(w), []);
    }
    finally { w.clean(); }
});

test('start-timeout reads a launch through cmd /c, and a hosted route beside it in the same inventory adds nothing', () =>
{
    const via = reg('atlassian', { command: 'cmd', args: ['/c', 'npx', '-y', 'mcp-remote@0.16.0', 'https://mcp.atlassian.com/v2/mcp'] }, { scope: 'user', route: 'remote' });
    const hosted = reg('context7', HOSTED, { scope: 'user', route: 'remote' });
    assert.strictEqual(detectAll(ctxFor({ platform: 'win32', registrations: [via, hosted] })).found.filter((f) => f.id === 'start-timeout').length, 1);
});

test('an unmanaged, an inherited and an alfred-retired npx registration give no start-timeout finding', () =>
{
    const mine = { own: true };
    const inherited = { scope: 'inherited' };
    const retired = { alfredRetired: true };
    for (const over of [mine, inherited, retired])
    {
        const registration = { ...reg('playwright-chrome', NPX_CHROME, { scope: 'user' }), ...over };
        assert.deepStrictEqual(detectAll(ctxFor({ registrations: [registration] })).found.filter((f) => f.id === 'start-timeout'), [], JSON.stringify(over));
    }
});

test('start-timeout refuses a settings file that is not an object, names it, and writes nothing', () =>
{
    const w = world();
    try
    {
        seed(w, 'playwright-chrome', 'user', NPX_CHROME);
        for (const text of ['[1, 2]', '{"env": []}'])
        {
            put(settingsOf(w), text);
            const list = found(w);
            assert.strictEqual(list.length, 1, text);
            assert.match(list[0]!.found, /not a settings object alfred-tools can read/);
            assert.strictEqual(list[0]!.blocked, 'add MCP_TIMEOUT=90000 to env yourself');
            const { l } = runFix(w);
            assert.strictEqual(fs.readFileSync(settingsOf(w), 'utf8'), text);
            assert.ok(l.lines.some((line) => line.startsWith('skipped start-timeout') && line.includes(settingsOf(w))), l.text());
        }
    }
    finally { w.clean(); }
});

test('start-timeout gives another config dir with the plugin its own finding, and applies to each', () =>
{
    const w = world();
    try
    {
        const mine = path.join(w.home, '.claude');
        const personal = path.join(w.home, '.claude-personal');
        const stranger = path.join(w.home, '.claude-stranger');
        w.env.CLAUDE_CONFIG_DIR = mine;
        installedIn(mine);
        installedIn(personal);
        put(path.join(personal, 'settings.json'), JSON.stringify({ theme: 'dark' }));
        put(path.join(stranger, 'settings.json'), '{}');
        seed(w, 'playwright-chrome', 'user', NPX_CHROME);
        assert.deepStrictEqual(found(w).map((f) => f.name).sort(), [path.join(mine, 'settings.json'), path.join(personal, 'settings.json')].sort());
        const { res, l } = runFix(w);
        assert.strictEqual(res.failed, null, l.text());
        assert.deepStrictEqual(readJson(path.join(mine, 'settings.json')), { env: SETTING });
        assert.deepStrictEqual(readJson(path.join(personal, 'settings.json')), { theme: 'dark', env: SETTING });
        assert.deepStrictEqual(readJson(path.join(stranger, 'settings.json')), {}, 'a dir without the plugin is left');
        assert.deepStrictEqual(found(w), []);
    }
    finally { w.clean(); }
});

test('update offers start-timeout under New ways to pass data and applies it', async () =>
{
    const w = world();
    try
    {
        seed(w, 'playwright-chrome', 'user', NPX_CHROME);
        const root = path.join(w.home, '.alfred-tools');
        put(path.join(root, 'mcps.json'), JSON.stringify({ version: 1, servers: [{ name: 'playwright-chrome', scope: 'user', row: 'playwright-chrome', route: 'local', clients: ['claude'], entry: NPX_CHROME, key: null }], own: [] }));
        const registry = fakeRegistry({ 'npm:@playwright/mcp': [{ version: '0.0.85', time: ago(30) }] });
        const c = await run(w, ['--check', '--no-refresh'], { registry });
        assert.strictEqual(c.code, 0, c.text);
        assert.match(c.text, /New ways to pass data:[\s\S]*start-timeout: /);
        const a = await run(w, ['--apply', `upgrade:start-timeout:${settingsOf(w)}`, '--no-refresh'], { registry });
        assert.strictEqual(a.code, 0, a.text);
        assert.strictEqual(readJson(settingsOf(w)).env.MCP_TIMEOUT, '90000');
    }
    finally { w.clean(); }
});
