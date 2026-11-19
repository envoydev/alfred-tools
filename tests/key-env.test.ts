// context7's key in its environment (spec D1): what the plan builds and configure changes, and (Task 3) the
// context7-key-env row in fix and update.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as catalogLib from '../scripts/catalog/catalog.ts';
import { plan } from '../scripts/plan/plan.ts';
import { renderPlan } from '../scripts/plan/render.ts';
import { currentOf } from '../scripts/entries/entry.ts';
import * as cursorMcp from '../scripts/cursor/cursor-mcp.ts';
import { MAC, POSIX_FIXTURE, inv, opts, pickOne, addStep, reg, changeOf } from './plan-helpers.ts';
import type { McpReplaceStep } from '../scripts/plan/types.ts';
import { world } from './helpers.ts';
import * as F from '../scripts/fix/fix-functions.ts';
import { detectAll, applyFixes } from '../scripts/fix/fix.ts';
import { reg as fixReg, ctxFor, detect, seed, ctxOf, localEntry, logged, shownOf } from './fix-helpers.ts';
import { run, fakeRegistry, ago, reAdd, localReg } from './update-helpers.ts';
import type { Finding } from '../scripts/fix/types.ts';

const catalog = catalogLib.load();

test('stdioKeyed reads a context7 key in env.CONTEXT7_API_KEY: Cursor is refused at Local (spec D1)', () => {
    assert.strictEqual(cursorMcp.stdioKeyed({ command: 'npx', args: ['-y', '@upstash/context7-mcp'], env: { CONTEXT7_API_KEY: 'x' } }, catalog.byId.get('context7'), 'local'), true);
});

test("context7's local route with a key at Local and Global puts it in env.CONTEXT7_API_KEY, never --api-key (spec D1)", { skip: POSIX_FIXTURE }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c7-env-'));
    try
    {
        const home = path.join(dir, 'home');
        const project = path.join(dir, 'shop');
        for (const root of [path.join(project, '.alfred-tools'), path.join(home, '.alfred-tools')])
        {
            fs.mkdirSync(root, { recursive: true });
            fs.writeFileSync(path.join(root, '.mcps-secrets'), 'CONTEXT7_API_KEY=test-key-not-real\n');
        }
        for (const scope of ['local', 'user'])
        {
            const p = plan(inv({ ...MAC, project }), pickOne('context7', { route: 'local', scope, token: true }), opts(home, { exists: (f) => fs.existsSync(f) }));
            assert.deepStrictEqual(p.errors, [], scope);
            const add = addStep(p);
            assert.ok(!add.entry.args!.includes('--api-key'), scope);
            assert.strictEqual(add.entry.env!['CONTEXT7_API_KEY'], '${CONTEXT7_API_KEY}', scope);
            assert.strictEqual(add.key!.name, 'CONTEXT7_API_KEY', scope);
            assert.ok(!JSON.stringify(p).includes('test-key-not-real'), scope);
        }
        const keyless = addStep(plan(inv({ ...MAC, project }), pickOne('context7', { route: 'local', scope: 'local', token: false }), opts(home))).entry;
        assert.ok(!('CONTEXT7_API_KEY' in (keyless.env || {})), 'no key: no CONTEXT7_API_KEY at all');
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('configure switching context7 local key off removes it from env, and a former --api-key with it (spec D1)', () => {
    const c7 = catalog.byId.get('context7')!;
    const inEnv = reg('c7', 'local', { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.7.0'], env: { npm_config_before: '2026-11-19T23:59:59Z', CONTEXT7_API_KEY: 'test-key-not-real' } }, 'context7', 'local');
    const inArgs = reg('c7', 'local', { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.5.0', '--api-key', 'test-key-not-real'], env: { npm_config_before: '2026-11-03T23:59:59Z' } }, 'context7', 'local');
    for (const r of [inEnv, inArgs])
    {
        assert.strictEqual(currentOf(c7, r).token, true, 'a key in either place reads as kept');
        const p = plan(inv(MAC, { registrations: [r] }), changeOf(r, { token: false }), opts('/Users/me'));
        assert.deepStrictEqual(p.errors, []);
        const replace = p.steps.find((s) => s.op === 'mcp-replace') as McpReplaceStep;
        assert.ok(!replace.entry.args!.includes('--api-key'), JSON.stringify(replace.entry));
        assert.ok(!('CONTEXT7_API_KEY' in (replace.entry.env || {})), JSON.stringify(replace.entry));
        assert.ok(!renderPlan(p).includes('test-key-not-real'));
        // kept as it is: nothing to do
        assert.ok(!plan(inv(MAC, { registrations: [r] }), changeOf(r, {}), opts('/Users/me')).steps.some((s) => s.op === 'mcp-replace'));
    }
});

test("a key route's env key is not read as a kept optional key: sentry local -> remote with no key answer stays OAuth (spec D1, currentOf)", () => {
    const sentry = catalog.byId.get('sentry')!;
    const r = reg('sentry', 'local', { command: 'npx', args: ['-y', '@sentry/mcp-server@0.49.0'], env: { npm_config_before: '2026-11-19T23:59:59Z', SENTRY_ACCESS_TOKEN: 'test-key-not-real' } }, 'sentry', 'local');
    assert.strictEqual(currentOf(sentry, r).token, false, 'token reads an optional key only');
    const p = plan(inv(MAC, { registrations: [r] }), changeOf(r, { route: 'remote' }), opts('/Users/me'));
    assert.deepStrictEqual(p.errors, []);
    const step = p.steps.find((s) => (s.op === 'mcp-replace' || s.op === 'mcp-add') && s.name === 'sentry') as McpReplaceStep;
    assert.ok(step && !('headersHelper' in step.entry), JSON.stringify(step && step.entry));
    assert.ok(!renderPlan(p).includes('test-key-not-real'));
});

test('context7-key-env moves a registration\'s --api-key <v> into env.CONTEXT7_API_KEY, same value, nothing printed (spec D1)', () =>
{
    const w = world();
    try
    {
        const before = { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.5.0', '--api-key', 'test-key-not-real'], env: { npm_config_before: '2026-11-03T23:59:59Z' } };
        seed(w, 'context7', 'local', before);
        const found = detectAll(ctxOf(w)).found.filter((f) => f.id === 'context7-key-env');
        assert.deepStrictEqual(found.map((f) => [f.name, f.scope]), [['context7', 'local']]);
        assert.ok(!shownOf(detectAll(ctxOf(w))).includes('test-key-not-real'));
        // a failed write stops the row: the registration is as it was
        const failing = logged();
        const bad = applyFixes(ctxOf(w, { env: { ...w.env, FAKE_CLAUDE_FAIL: '"CONTEXT7_API_KEY"' } }), ['context7-key-env'], { log: failing.log });
        assert.ok(bad.failed, failing.text());
        assert.deepStrictEqual(localEntry(w, 'context7')?.args, before.args);
        const out = logged();
        const res = applyFixes(ctxOf(w), ['context7-key-env'], { log: out.log });
        assert.strictEqual(res.failed, null, out.text());
        const after = localEntry(w, 'context7');
        assert.ok(after);
        assert.deepStrictEqual(after.args, ['-y', '@upstash/context7-mcp@4.5.0']);
        assert.deepStrictEqual(after.env, { npm_config_before: '2026-11-03T23:59:59Z', CONTEXT7_API_KEY: 'test-key-not-real' });
        assert.ok(!out.text().includes('test-key-not-real') && !failing.text().includes('test-key-not-real'));
        assert.deepStrictEqual(detectAll(ctxOf(w)).found.filter((f) => f.id === 'context7-key-env'), []);
    }
    finally { w.clean(); }
});

test('context7-key-env: a key in both places keeps the --api-key value, the one the server reads first', () =>
{
    const both = { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.5.0', '--api-key', 'test-key-args'], env: { CONTEXT7_API_KEY: 'test-key-env' } };
    const ctx = ctxFor({ registrations: [fixReg('context7', both)] });
    const [f] = detect(ctx).found.filter((x) => x.id === 'context7-key-env') as [Finding];
    assert.deepStrictEqual(F.context7KeyEnvFix(both, f, ctx), { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.5.0'], env: { CONTEXT7_API_KEY: 'test-key-args' } });
    assert.deepStrictEqual(detect(ctxFor({ registrations: [fixReg('context7', { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.7.0'], env: { CONTEXT7_API_KEY: 'x' } })] })).found.filter((x) => x.id === 'context7-key-env'), [], 'the key already in env');
});

test('update offers context7-key-env under New ways to pass data and moves --api-key into env, nothing printed (spec D1)', async () =>
{
    const w = world();
    try
    {
        reAdd(w, 'context7', { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.7.0', '--api-key', 'test-key-not-real'], env: { npm_config_before: '2026-11-19T23:59:59Z' } });
        const registry = fakeRegistry({ 'npm:@upstash/context7-mcp': [{ version: '4.7.0', time: ago(30) }] });
        const c = await run(w, ['--check', '--no-refresh'], { registry });
        assert.match(c.text, /New ways to pass data:[\s\S]*context7 \(local\)\s+context7-key-env: /);
        assert.ok(!c.text.includes('test-key-not-real'));
        const a = await run(w, ['--apply', 'upgrade:context7-key-env:context7~local', '--no-refresh'], { registry });
        assert.strictEqual(a.code, 0, a.text);
        assert.ok(!a.text.includes('test-key-not-real'));
        const after = localReg(w, 'context7').entry;
        assert.deepStrictEqual(after.args, ['-y', '@upstash/context7-mcp@4.7.0']);
        assert.strictEqual(after.env!['CONTEXT7_API_KEY'], 'test-key-not-real');
    }
    finally { w.clean(); }
});
